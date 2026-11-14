import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import {
  AUTOMATISIERUNG_GRENZEN, ausloeserSchluessel, automatisierungsProbleme, automatisierungsProblemOrte, bereinigeAutomatisierung, kontextTyp, kurzform, REIHENFOLGE,
  type Angehalten, type Automatisierung, type AutomatisierungAnsicht, type AutomatisierungDaten, type DannArt, type DannKarte,
  type Empfaenger, type Fehlschlag, type Herkunft, type Kontextdaten, type Lauf, type LaufZustand, type Schritt, type UndKarte, erreichteDaten,
  PERSONEN_IM_EREIGNIS, paketKarteLeer, DMS_POST, istBetrieb, protokollPasst, PROTOKOLL_ABSTAND_MIN, BETRIEB_PLATZHALTER, SYSTEMKONTO_WERKBANK, werkbankBereiche, wennBereich, laufFuer,
  istAufruf, aussenKarten, zielFuer,
} from '../../shared/src/automatisierung';
import {
  Aufrufe, Ausleitung, speicherAufrufRepo, speicherAusgangRepo, speicherAussenGeheimnisRepo, type AufrufRepo, type AufrufStand, type AusgangRepo, type AusgangVerlauf,
  type AussenGeheimnisRepo, type SichererAbruf,
} from './automatisierung/index';
import { speicherEinstellungen } from './einstellungen';
import type { Mailer } from './mail';
import type { Kurzzustand } from './kurzzustand';
import { EREIGNISKATALOG, istBetriebWenn, wennFaehig, type KatalogEreignis } from '../../shared/src/ereignisse';
import { darfBereich } from '../../shared/src/verwaltungsrecht';
import type { SystemWerkbank } from './automatisierung-werkbank';
import { eigeneVersion } from './system';
import { tagVon, titelAus, type Benutzer, type Mappe, type Mappentyp } from '../../shared/src/model';
import { postKennung, postVorlageNeu } from '../../shared/src/postfelder';
import { heuteIn, merkmalTrifft, verschiebe, type Bedingung } from '../../shared/src/sichten';
import { uebersetzer } from '../../shared/src/sprache';
import texte from '../../shared/src/sprachen/de/automatisierung.json';
import ereignisTexte from '../../shared/src/sprachen/de/ereignisse.json';
import werkbankTexte from '../../shared/src/sprachen/de/werkbank.json';
import type { Dienst } from './dienst';
import type { Zugriff } from './kern';
import type { PaketAutomatisierung } from './pakete';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { faelligeTage, laufeFaellige, wochentagVon, zeitpunktIn, type Merker } from './zeitplan';
import { feiertagAm, istBundesland } from '../../shared/src/feiertage';
import { wirksameZeit } from './aufgabenmail';
import { istUuid } from './repo';
import { datumsformat, liesRegion } from '../../shared/src/region';
import { liesFavoritenFreigabe } from '../../shared/src/favoritenfreigabe';
import { gebietsschema } from '../../shared/src/sprache';
import { oeffentlichErreichbar } from '../../shared/src/auskunft';
import { beschreibeAenderungen } from '../../shared/src/fassungsvergleich';

/**
 * Motor der Automatisierungen (#674): Wenn · Und · Dann · Sonst (#677), ausgeführt unter dem Systemkonto „Automatisierung“ (#673).
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
const t = uebersetzer({ automatisierung: texte, ereignisse: ereignisTexte, werkbank: werkbankTexte });
/** Zeitplan „Datum in N Tagen“ und Aufräumen. */
const ZEITPLAN_MS = 60_000;
/** Ein Lauf, der so lange auf „läuft“ steht, gehört einem Server, der dabei gestorben ist. */
const HAENGT_MIN = 10;

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
    async liste() { return [...autos.values()].map((a) => structuredClone(a)).sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de')); },
    async hole(id) { const a = autos.get(id); return a && structuredClone(a); },
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
    async loesche(id) { autos.delete(id); for (let i = laeufe.length - 1; i >= 0; i--) if (laeufe[i].automatisierungId === id) laeufe.splice(i, 1); },
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
  return {
    async liste() { return (await sql`SELECT * FROM automatisierungen WHERE haushalt_id = ${haushaltId} ORDER BY reihenfolge, name, id`).map(alsAuto); },
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
      const [r] = await sql`UPDATE automatisierungen SET name = ${d.name}, reihenfolge = ${d.reihenfolge}, daten = ${json(nurDaten(d))}, aktiv = ${d.aktiv},
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
    async loesche(id) { if (istUuid(id)) await sql`DELETE FROM automatisierungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
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
  /** Id des auslösenden Ereignisses (#1082: feste Ids für Folge-Ereignisse; beim Probelauf die des Laufs). */
  ereignisId: string;
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
  /**
   * Auslösende Person (#671): Benutzer-Id, wenn ein Mensch das Ereignis ausgelöst hat; sonst null (Zeitplan, Datum,
   * System, Paket, Automatisierung, Probelauf). Mails an ein Feld füllen ihre Platzhalter mit deren Rechten.
   */
  person: string | null;
  /** Vermerk für die Historie der Mappe: „durch Automatisierung ‚…‘ (eingerichtet von …)“. */
  anlass: Record<string, unknown>;
  /** Werkbank-Rechte des Systemkontos (#677) – genau die Liste, sonst nichts; fehlt in Tests ohne Werkbank. */
  werkbank?: SystemWerkbank;
  /** Id des Laufs und Art des Ereignisses (#671: Karten nach außen nennen sie in der Meldung). */
  laufId?: string;
  anlassArt?: string;
  /** Karten nach außen (#671): Ausgangskorb und Adresse von Ablago (für Links und den Hinweissatz der E-Mail). */
  aussen?: { ausleitung: Ausleitung; basis: () => string };
}
/**
 * Die Karte hat nichts zu tun, weil ihr Ziel fehlt (#1082: Paket entfernt oder ohne das Ereignis) – der Schritt gilt als
 * übersprungen, nicht als Fehler: kein Wiederholen, keine Fehlerflut, die Automatisierung bleibt an.
 */
export class KarteLeer extends Error {}
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
  /** Werkbank-Rechte des Systemkontos (#677): Sicherung anstoßen, neue Version, gemeldete Fehler, Protokoll. */
  werkbank?: SystemWerkbank;
  /**
   * „Aufruf von außen“ (#679): Speicher der Adressen, Kurzzustand (Bremse, Wiederholschutz über alle Prozesse),
   * Ver- und Entschlüsseln des Geheimnisses, Adresse von Ablago. Ohne: im Arbeitsspeicher, Tresor des Dienstes.
   */
  aufruf?: { repo?: AufrufRepo; zustand?: () => Kurzzustand; verschluessele?: (k: string) => string; entschluessele?: (w: string) => string | null; basis?: () => string };
  /**
   * Karten nach außen (#671): Ausgangskorb und Geheimnisse (Datenbank), Einstellungen (freigegebene Ziele), Mailversand,
   * Adresse von Ablago; `abruf` nur für Tests. Ohne: im Arbeitsspeicher, Einstellungen des Kerns, ohne Mailversand.
   */
  aussen?: { repo?: AusgangRepo; geheimnisse?: AussenGeheimnisRepo; mailer?: () => Mailer | null; basis?: () => string; abruf?: SichererAbruf;
    verschluessele?: (k: string) => string; entschluessele?: (w: string) => string | null };
}

/** Ereignis, wie der Motor es verarbeitet (aus dem Katalog oder vom Zeitplan). */
interface Anlass { id: string; art: string; daten: Record<string, unknown>; kette: number; ausloeser?: KatalogEreignis['ausloeser'] }

/**
 * Mappe eines Anlasses: die Mappe bzw. der Benutzer (Benutzer sind Mappen). Werkbank-Karten (#677) haben keine – auch
 * wenn „Fehler gemeldet“ die meldende Person nennt.
 */
const mappeVon = (anlass: Pick<Anlass, 'art' | 'daten'>): string | null => (istBetriebWenn(anlass.art) ? null
  : typeof anlass.daten.mappe === 'string' ? anlass.daten.mappe : typeof anlass.daten.benutzer === 'string' ? anlass.daten.benutzer : null);

/** Feste UUID aus einem Text (gleiche Eingabe = gleiche Id; mehrere Server legen nichts doppelt an). */
export const uuidAus = (s: string) => { const h = createHash('sha256').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const UHR_FORMAT = () => datumsformat(gebietsschema(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Feste Id der beim Update übernommenen Vertretungs-Aufgabe (#712/#678). */
const UMZUG_VERTRETUNG = uuidAus('umzug|vertretung');
/**
 * Feste Ids der beim Update übernommenen Benachrichtigungen (#678): Zusammenfassung, Favoriten, Anmeldeschutz; dazu
 * „Post für dich“ (#1001).
 */
const UMZUG = {
  zusammenfassung: uuidAus('umzug|zusammenfassung'), favoriten: uuidAus('umzug|favoriten'),
  sammel: uuidAus('umzug|anmeldeschutz'), konto: uuidAus('umzug|kontosperre'), post: uuidAus('umzug|post-fuer-dich'),
} as const;

/** Paket mit den mitgelieferten Benachrichtigungen (dms-registry #109, #153). */
export const BENACHRICHTIGUNGEN_PAKET = 'benachrichtigungen';

/**
 * „Post für dich“ (#1001, dms-registry #153) – so, wie der Kern die Aufgabe bis 0.256 selbst anlegte: Wenn neue Post
 * eingeht oder sich „An“ bzw. der Stand ändert, solange sie neu ist und jemand in „An“ steht → Aufgabe an diese Person
 * (bei Abwesenheit an die Vertretung). Sie heißt „Post für dich“ (Art), erledigt sich, sobald die Post nicht mehr neu ist
 * oder an jemand anderen geht, und entsteht je Post und Person nur einmal (automatisierung-karten.ts). Dieselben Karten
 * bringt das Paket „Benachrichtigungen“ ab 1.3.0 mit (Typ `dms:post`).
 */
export function postFuerDichDaten(postTyp: string, texte2: { name: string; beschreibung: string; text: string }): AutomatisierungDaten {
  return bereinigeAutomatisierung({
    name: texte2.name, beschreibung: texte2.beschreibung,
    wenn: { art: 'mappe.geaendert', typ: postTyp, felder: ['an', 'stand'], angelegt: true },
    und: { modus: 'alle', karten: [
      { art: 'bedingung', bedingung: { art: 'feld', feld: 'an', op: 'nichtLeer' } },
      { art: 'bedingung', bedingung: { art: 'feld', feld: 'stand', op: 'einerVon', wert: { art: 'fest', wert: ['Neu'] } } },
    ] },
    dann: [{ id: 'p1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'an' }], text: texte2.text }],
  });
}

/** Ist das „Post für dich“ – Wenn „Post angelegt oder gespeichert“ und eine Aufgabe an „An“? */
export function istPostFuerDich(d: Pick<AutomatisierungDaten, 'wenn' | 'dann'>, postTyp: string | null): boolean {
  const w = d.wenn;
  return !!postTyp && w.art === 'mappe.geaendert' && w.typ === postTyp && w.angelegt === true
    && d.dann.some((k) => k.art === 'aufgabe' && k.als === 'aufgabe' && k.empfaenger.some((e) => e.art === 'feld' && e.feld === 'an'));
}

/** Welche übernommene Benachrichtigung eine mitgelieferte Automatisierung ersetzt (nach ihrer ersten Dann-Karte). */
function umzugFuer(d: AutomatisierungDaten, postTyp: string | null = null): string | null {
  const k = d.dann[0];
  if (!k) return null;
  if (k.art === 'zusammenfassung') return UMZUG.zusammenfassung;
  if (k.art === 'favoriten') return UMZUG.favoriten;
  if (k.art === 'anmeldeschutz') return k.was === 'sammel' ? UMZUG.sammel : UMZUG.konto;
  if (istPostFuerDich(d, postTyp)) return UMZUG.post;
  return null;
}
const UMZUG_IDS = new Set<string>([UMZUG_VERTRETUNG, ...Object.values(UMZUG)]);

/** Stand einer Automatisierung in einer Fassung (#1006). */
const fassungsStand = (a: AutomatisierungDaten & { aktiv: boolean }) => ({ name: a.name, beschreibung: a.beschreibung, reihenfolge: a.reihenfolge, aktiv: a.aktiv, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst });

/** Das Repo mit Fassungen (#1006): nach Anlegen, Speichern und an/aus festhalten, beim Löschen mit Vermerk. */
function mitFassungen(repo: AutomatisierungRepo, dienst: Dienst): AutomatisierungRepo {
  const halte = (id: string) => dienst.kern.fassungen.halte('automatisierung', id);
  return {
    ...repo,
    async lege(a) { await repo.lege(a); await halte(a.id); },
    async speichere(id, d, von, erwartet) { const ok = await repo.speichere(id, d, von, erwartet); if (ok) await halte(id); return ok; },
    async setze(id, d) { await repo.setze(id, d); if (d.aktiv !== undefined) await halte(id); },
    async loesche(id) { await dienst.kern.fassungen.geloescht('automatisierung', id, () => repo.loesche(id)); },
  };
}

/** Gleicher Stand unabhängig von der Reihenfolge der Schlüssel (Wenn-Karte vor und nach dem Speichern). */
function gleicherStand(a: unknown, b: unknown): boolean {
  const sortiert = (w: unknown): unknown => (Array.isArray(w) ? w.map(sortiert) : w && typeof w === 'object'
    ? Object.fromEntries(Object.entries(w as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, sortiert(v)])) : w);
  return JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
}

/**
 * Bringt eine mitgelieferte Automatisierung eine Werkbank-Karte (#677) oder die Wenn-Karte „Aufruf von außen“ (#679)
 * mit? Dann wird sie übergangen – eine Adresse ohne Anmeldung legt nur die Verwaltung selbst an.
 */
function mitWerkbankKarte(paket: string, x: PaketAutomatisierung): boolean {
  const d = bereinigeAutomatisierung({ wenn: x.wenn, dann: x.dann, sonst: (x as { sonst?: unknown }).sonst });
  // Karten nach außen (#671): Ausleiten bleibt eine bewusste Entscheidung der Verwaltung – nie aus einem Paket.
  const ja = werkbankBereiche(d).length > 0 || istAufruf(d.wenn) || aussenKarten(d).length > 0;
  if (ja) log.warn('Mitgelieferte Automatisierung mit Werkbank-Karte übergangen', { paket, automatisierung: x.schluessel });
  return ja;
}

/** Id einer mitgelieferten Automatisierung – nach einem Umzug (#1084, `ersetzt`) die aus der früheren Paket-Id. */
function paketAutomatisierungId(p: InstalliertesPaket, schluessel: string, vorhanden: Automatisierung[]): string {
  return [p.id, ...(p.ersetzt ?? [])].map((k) => uuidAus(`paket|${k}|${schluessel}`)).find((k) => vorhanden.some((a) => a.id === k)) ?? uuidAus(`paket|${p.id}|${schluessel}`);
}

export class Automatisierungen {
  private uhr: ReturnType<typeof setInterval> | null = null;
  private zeitplanLauf: Promise<void> | null = null;
  /** Merker für den Zeitplan, wenn es keinen Einstellungsspeicher gibt (Tests). */
  private merkerOhneSpeicher = new Map<string, string>();
  /** „Aufruf von außen“ (#679): Adressen, Geheimnisse, Signatur und Bremse (`automatisierung/aufruf.ts`). */
  readonly aufrufe: Aufrufe;
  /** Karten nach außen (#671): Ziele, Geheimnisse, Ausgangskorb und Zustellung (`automatisierung/ausleitung.ts`). */
  readonly ausleitung: Ausleitung;
  private aussenBasis: () => string;
  constructor(private d: AutomatisierungDeps) {
    this.d = { ...d, repo: mitFassungen(d.repo, d.dienst) };
    const x = d.aufruf ?? {};
    this.aufrufe = new Aufrufe({
      repo: x.repo ?? speicherAufrufRepo(), zustand: x.zustand ?? (() => d.dienst.kurzzustand),
      verschluessele: x.verschluessele ?? ((k) => d.dienst.verschluesseleGeheimnis(k)), entschluessele: x.entschluessele ?? ((w) => d.dienst.entschluessele(w)),
      basis: x.basis, uhr: d.uhr,
      automatisierung: (id) => this.d.repo.hole(id),
      ausloesen: (a, id, daten) => this.reihe([a], { id, art: 'aufruf', daten, kette: 0 }),
    });
    const y = d.aussen ?? {};
    this.aussenBasis = y.basis ?? x.basis ?? (() => '');
    this.ausleitung = new Ausleitung({
      repo: y.repo ?? speicherAusgangRepo(), geheimnisse: y.geheimnisse ?? speicherAussenGeheimnisRepo(),
      einstellungen: d.dienst.kern.einstellungen ?? speicherEinstellungen(),
      verschluessele: y.verschluessele ?? x.verschluessele ?? ((k) => d.dienst.verschluesseleGeheimnis(k)), entschluessele: y.entschluessele ?? x.entschluessele ?? ((w) => d.dienst.entschluessele(w)),
      automatisierung: (id) => this.d.repo.hole(id),
      // Dauerfehler (#671): anhalten mit Grund „ziel“ – Werkbank-Übersicht und Mail der technischen Aufgaben melden es.
      anhalten: async (id, text) => { await this.d.repo.setze(id, { angehalten: { grund: 'ziel', text, zeit: this.iso() } }); },
      mailer: y.mailer ?? (() => null), pause: d.pause, abruf: y.abruf, uhr: d.uhr,
    });
    d.dienst.automatisierungenVon = async (kontoId) => {
      const konto = await this.konto().catch(() => null);
      return konto?.id === kontoId ? (await this.d.repo.liste()).filter((a) => a.herkunft !== 'paket').map((a) => ({ id: a.id, name: a.name, ...(a.aktiv && a.angehalten ? { angehalten: true } : {}) })) : [];
    };
    d.dienst.fristenUebernehmen = () => this.fristenUebernehmen();
    // Automatisierungsvorlagen (#1044): ein Motor – Platzhalter wie in jeder Automatisierung, mit den Rechten der Person,
    // die den Ablauf angelegt hat, und denen des Empfängers (#795). {automatisierung} ist der Name der Vorlage.
    d.dienst.ablaufPlatzhalter = (text, c, empf) => this.fuelleMit(text, { a: { name: c.name }, mappe: c.mappe, typ: c.typ, z: c.z, daten: c.daten }, empf);
    d.dienst.paketAutomatisierungen = (p, liste, ein) => this.ausPaket(p, liste, ein);
    d.dienst.paketAutomatisierungenVergleich = (p, liste) => this.paketVergleich(p, liste as PaketAutomatisierung[]);
    d.dienst.typUmgebaut = (alt, neu, felder) => this.typUmgebaut(alt, neu, felder);
    // #1001: Favoriten und Tägliche Zusammenfassung stellt man nur noch in der Automatisierung ein.
    d.dienst.favoritenRegeln = async () => (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'favorit.geaendert')
      .flatMap((a) => a.dann.flatMap((k) => (k.art === 'favoriten' ? [{ rollen: k.rollen ?? [], vorgabe: k.vorgabe !== false }] : [])));
    d.dienst.zusammenfassungVorgabe = async () => {
      const a = (await this.d.repo.liste()).find((x) => x.aktiv && !x.angehalten && x.wenn.art === 'zeitplan' && x.wenn.jeBenutzer && x.dann.some((k) => k.art === 'zusammenfassung'));
      return a && a.wenn.art === 'zeitplan' ? { uhrzeit: a.wenn.uhrzeit } : null;
    };
    // Vollexport: Automatisierungen mit ihrem Änderungsverlauf (die Läufe sind Protokoll und bleiben draußen).
    // Die Fassungen (#1006) stehen seit #1006 in struktur/fassungen.json; hier wie bisher je Automatisierung (Nummer als version).
    d.dienst.automatisierungenExport = async () => Promise.all((await this.d.repo.liste()).map(async (a) => ({
      ...a, fassungen: (await d.dienst.kern.repo.fassungen('automatisierung', a.id)).map((f) => ({ version: f.nr, zeit: f.zeit, von: f.urheber.art === 'person' ? f.urheber.id : null, daten: f.daten })),
    })));
    this.fassungenAnmelden();
  }
  /**
   * Fassungen (#1006): Name, Beschreibung, Reihenfolge, an/aus, Wenn, Und, Dann und Sonst – nicht der Zustand (angehalten,
   * letzter Tag). Wiederherstellen über das normale Speichern (dieselben Prüfungen): Passt die Fassung nicht mehr zum
   * heutigen Stand (Feld oder Ansicht weg), meldet Ablago das wie beim Speichern, statt sie still zu ändern.
   */
  private fassungenAnmelden() {
    this.d.dienst.fassungen.registriere({
      art: 'automatisierung',
      stand: async (id) => { const a = await this.d.repo.hole(id); return a && { name: a.name, daten: fassungsStand(a) }; },
      alle: async () => (await this.d.repo.liste()).map((a) => a.id),
      stelleHer: async (id, daten, o) => {
        const a = await this.gibt(id);
        // Werkbank-Karten (#677): wie beim Speichern nur mit dem Recht am Bereich (`darf` der Person).
        await this.aendere(id, { ...bereinigeAutomatisierung(daten), aktiv: (daten as { aktiv?: unknown }).aktiv === true, version: a.version }, o.von.id, o.darf);
      },
      kontext: async () => ({ automatisierung: await this.kontext() }),
    });
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
    // Karten nach außen (#671): den Ausgangskorb zustellen (nur der Leiter startet den Motor).
    this.ausleitung.start();
    // #712: Erinnerungen am Feld werden zu Automatisierungen – erst die Fristen übernehmen; frühere Beispiele des Kerns räumen (#883).
    void this.fristenUebernehmen().catch((e) => log.warn('Erinnerungen nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.benachrichtigungenUebernehmen()).catch((e) => log.warn('Benachrichtigungen nicht übernommen', { fehler: (e as Error).message }))
      // #1001: „Post für dich“ und die Freigabe „Favoriten benachrichtigen“ ziehen in Automatisierungen um.
      .then(() => this.postFuerDichUebernehmen()).catch((e) => log.warn('„Post für dich“ nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.favoritenFreigabeUebernehmen()).catch((e) => log.warn('Freigabe „Favoriten benachrichtigen“ nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.raeumeBeispieleAuf()).catch((e) => log.warn('Frühere Beispiele nicht aufgeräumt', { fehler: (e as Error).message }));
    this.uhr ??= setInterval(() => { void this.zeitplan().catch((e) => log.error('Zeitplan fehlgeschlagen', { fehler: (e as Error).message })); }, ZEITPLAN_MS);
    this.uhr.unref?.();
  }
  stop() { if (this.uhr) clearInterval(this.uhr); this.uhr = null; this.ausleitung.stop(); this.d.dienst.ereignisse.abbestellen('automatisierungen'); }

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
  /** Mitgelieferte Automatisierung mit unbekanntem Mappentyp (#1084): angehalten statt auf alle Typen. */
  private haltOhneTyp(paket: string, x: PaketAutomatisierung, typId: (vw: unknown) => string | null): Angehalten | null {
    if (typeof x.wenn.typ !== 'string' || !x.wenn.typ || typId(x.wenn.typ)) return null;
    log.warn('Mitgelieferte Automatisierung angehalten: Mappentyp unbekannt', { paket, automatisierung: x.schluessel, typ: x.wenn.typ });
    return { grund: 'fehlerhaft', text: t('automatisierung.angehalten.typ-unbekannt', { typ: x.wenn.typ }), zeit: this.iso() };
  }

  /**
   * Paket-Umbau (#1041): Automatisierungen, die den alten Typ nennen, zeigen danach auf den Zieltyp; hängen sie an ihm
   * (Auslöser), nennen ihre Karten die neuen Feldkennungen. Als neue Fassung im Änderungsverlauf, an/aus bleibt.
   */
  async typUmgebaut(alt: string, neu: string, felder: Record<string, string>): Promise<number> {
    let n = 0;
    const umbenennen = (x: unknown, typAm: boolean): unknown => {
      if (typeof x === 'string') return x === alt ? neu : typAm ? x.replace(/\{([a-z][a-z0-9_]*)([|}])/g, (g, k: string, r: string) => (felder[k] ? `{${felder[k]}${r}` : g)) : x;
      if (Array.isArray(x)) return x.map((y) => umbenennen(y, typAm));
      if (!x || typeof x !== 'object') return x;
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typAm && (k === 'feld' || k === 'key') && typeof v === 'string' && felder[v] ? felder[v] : umbenennen(v, typAm)]));
    };
    for (const a of await this.d.repo.liste()) {
      const roh = { wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst };
      if (!JSON.stringify(roh).includes(alt)) continue;
      const amTyp = (a.wenn as { typ?: string | null }).typ === alt;
      const x = umbenennen(roh, amTyp) as typeof roh;
      await this.d.repo.speichere(a.id, { ...a, ...x }, null, a.version);
      n++;
    }
    if (n) log.info('Automatisierungen nach Paket-Umbau umgeleitet', { anzahl: n, typ: alt, ziel: neu });
    return n;
  }

  /**
   * Wie eine mitgelieferte Automatisierung in dieser Ablage aussieht: Typen des Pakets auf die installierten, „Paket nach
   * Zeitplan ausführen“ auf das Paket selbst, Reihenfolge der Pakete. Für ausPaket und die Update-Vorschau (#1174).
   */
  private async paketUmsetzer(p: Pick<InstalliertesPaket, 'id' | 'typen'>) {
    const pakete = await this.d.dienst.kern.repo.listePakete();
    // Post von Ablago (#1001): `dms:post` – Automatisierungen auf Post brauchen keinen eigenen Mappentyp.
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const typId = (vw: unknown): string | null => {
      if (typeof vw !== 'string' || !vw) return null;
      if (vw === DMS_POST) return postTyp;
      const [pk, sl] = vw.includes(':') ? vw.split(':') : [p.id, vw];
      return (pk === p.id ? p.typen[sl] : pakete.find((x) => x.id === pk)?.typen[sl]) ?? null;
    };
    const daten = (x: PaketAutomatisierung) => {
      // „Paket nach Zeitplan ausführen“ (#1082): Im Paket steht kein Ziel – es ist immer das Paket selbst.
      const dann = x.dann.map((k) => (k && typeof k === 'object' && (k as Record<string, unknown>).art === 'paket' ? { ...k, paket: p.id } : k));
      const d = bereinigeAutomatisierung({ name: x.name, beschreibung: x.beschreibung, wenn: { ...x.wenn, typ: typId(x.wenn.typ) }, und: x.und, dann });
      d.reihenfolge = REIHENFOLGE.paket;
      return d;
    };
    return { typId, postTyp, daten };
  }

  /**
   * Update-Vorschau (#1174): mitgelieferte Automatisierungen, die jemand geändert hat, bleiben beim Update, wie sie sind.
   * Je solcher Automatisierung, was die neue Fassung aus dem Paket anders macht – lesbar wie bei den Fassungen.
   * Gleich geblieben (die eigene Änderung entspricht dem Paket) fällt weg.
   */
  async paketVergleich(p: InstalliertesPaket, liste: PaketAutomatisierung[]): Promise<Record<string, { id: string; aenderungen: string[] }>> {
    const { daten } = await this.paketUmsetzer(p);
    const vorhanden = (await this.d.repo.liste()).filter((a) => a.herkunft === 'paket' && a.paketId === p.id);
    const kontext = { automatisierung: await this.kontext() };
    const aus: Record<string, { id: string; aenderungen: string[] }> = {};
    for (const x of liste.filter((y) => !mitWerkbankKarte(p.id, y))) {
      const da = vorhanden.find((a) => a.id === paketAutomatisierungId(p, x.schluessel, vorhanden));
      if (!da || da.geaendertVon === null) continue;
      const aenderungen = beschreibeAenderungen('automatisierung', fassungsStand(da), fassungsStand({ ...daten(x), aktiv: da.aktiv }), kontext);
      if (aenderungen.length) aus[x.schluessel] = { id: da.id, aenderungen };
    }
    return aus;
  }

  async ausPaket(p: InstalliertesPaket, liste: PaketAutomatisierung[], ein: string[] = []): Promise<number> {
    const { typId, postTyp, daten } = await this.paketUmsetzer(p);
    const vorhanden = (await this.d.repo.liste()).filter((a) => a.herkunft === 'paket' && a.paketId === p.id);
    const ids = new Set<string>();
    let neu = 0;
    // Werkbank-Karten (#677) gibt es nur in selbst angelegten Automatisierungen – die Prüfung beim Installieren lehnt sie ab.
    for (const x of liste.filter((y) => !mitWerkbankKarte(p.id, y))) {
      // Nach einem Umzug (#1084) behält eine mitgelieferte Automatisierung ihre Id aus der früheren Paket-Id.
      const id = paketAutomatisierungId(p, x.schluessel, vorhanden);
      ids.add(id);
      const d = daten(x);
      // Unbekannter Mappentyp (#1084, Sicherheit A): geschlossen statt offen – ohne Typ liefe sie auf alle; sie hält an.
      const halt = this.haltOhneTyp(p.id, x, typId);
      const da = vorhanden.find((a) => a.id === id);
      if (da) {
        if (da.geaendertVon === null) await this.d.repo.speichere(id, { ...d, aktiv: da.aktiv }, null, da.version);
        if (halt) await this.d.repo.setze(id, { angehalten: halt });
        continue;
      }
      let aktiv = ein.includes(x.schluessel);
      const uebernommeneId = d.wenn.art === 'datum' ? uuidAus(`frist|${d.wenn.typ}|${d.wenn.feld}`) : d.wenn.art === 'benutzer.abwesenheit_gesetzt' ? UMZUG_VERTRETUNG : umzugFuer(d, postTyp);
      if (uebernommeneId) {
        const alt = await this.d.repo.hole(uebernommeneId);
        if (alt && alt.geaendertVon !== null) { log.info('Mitgelieferte Automatisierung nicht angelegt: die übernommene Erinnerung wurde geändert', { paket: p.id, automatisierung: x.schluessel, bleibt: alt.id }); continue; }
        if (alt) { aktiv = alt.aktiv; await this.d.repo.loesche(alt.id); }
      }
      const a: Automatisierung = { ...d, id, aktiv: aktiv && !halt, angehalten: halt, herkunft: 'paket', paketId: p.id, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
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

  /**
   * „Post für dich“ → Automatisierung (#1001): Der Kern legt die Aufgabe nicht mehr selbst an; das macht die mitgelieferte
   * Automatisierung des Pakets „Benachrichtigungen“ (ab 1.3.0). **Einmal** beim ersten Start nach dem Update (Einstellung
   * `post_umzug`): Ist das Paket installiert, entsteht bis zu seinem Update eine eingeschaltete Automatisierung mit
   * denselben Karten (feste Id); das Update des Pakets ersetzt sie, solange sie unverändert ist (an/aus bleibt). Ohne das
   * Paket entsteht keine – so entschieden in #1001; die Werkbank-Übersicht weist darauf hin. Offene Aufgaben „Post für
   * dich“ bleiben und erledigen sich wie bisher (post.dienst.ts).
   */
  async postFuerDichUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    if (!einst || await einst.lies('post_umzug')) return 0;
    const pakete = await this.d.dienst.kern.repo.listePakete();
    const mitPaket = pakete.some((p) => p.id === BENACHRICHTIGUNGEN_PAKET || p.ersetzt?.includes(BENACHRICHTIGUNGEN_PAKET));
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const alle = await this.d.repo.liste();
    let neu = 0;
    if (mitPaket && !alle.some((a) => istPostFuerDich(a, postTyp))) {
      const d = postFuerDichDaten(postTyp, { name: t('automatisierung.post.name'), beschreibung: t('automatisierung.post.beschreibung'), text: t('automatisierung.post.text') });
      d.reihenfolge = REIHENFOLGE.eigen;
      const a: Automatisierung = { ...d, id: UMZUG.post, aktiv: true, angehalten: null, herkunft: 'eigen', paketId: null, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
      try { await this.d.repo.lege(a); neu++; log.info('„Post für dich“ als Automatisierung übernommen', { automatisierung: a.id }); } catch { /* ein anderer Server war schneller */ }
    } else if (!mitPaket) log.info('„Post für dich“ entfällt: Paket „Benachrichtigungen“ nicht installiert');
    await einst.schreibe('post_umzug', { am: this.iso(), anzahl: neu, paket: mitPaket });
    return neu;
  }

  /**
   * Freigabe „Favoriten benachrichtigen“ → Automatisierung (#1001): Was die Werkbank unter Aufgaben einstellte, steht
   * danach in der Karte „Favoriten-Änderungen melden“ – „für niemanden“ schaltet die Automatisierungen aus, „nur diese
   * Rollen“ wird ihre Rollen-Auswahl, „Vorgabe für neue Benutzer: aus“ ihre Vorgabe. Einmal, solange die Einstellung
   * `favoriten_freigabe` noch da ist (sie fällt danach weg). Geänderte Karten gelten als vom Admin angepasst (ein
   * Paket-Update überschreibt sie nicht).
   */
  async favoritenFreigabeUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    const roh = await einst?.lies('favoriten_freigabe');
    if (!einst || !roh) return 0;
    const f = liesFavoritenFreigabe(roh);
    const niemand = f.erlaubt === 'aus' || (f.erlaubt === 'rollen' && !f.rollen.length);
    const konto = await this.konto().catch(() => null);
    let n = 0;
    for (const a of (await this.d.repo.liste()).filter((x) => x.dann.some((k) => k.art === 'favoriten'))) {
      const dann = a.dann.map((k) => (k.art !== 'favoriten' ? k : { ...k, ...(f.erlaubt === 'rollen' && f.rollen.length ? { rollen: f.rollen } : {}), ...(f.vorgabe ? {} : { vorgabe: false }) }));
      const geaendert = JSON.stringify(dann) !== JSON.stringify(a.dann);
      const aktiv = niemand ? false : a.aktiv;
      if (!geaendert && aktiv === a.aktiv) continue;
      if (geaendert) { if (await this.d.repo.speichere(a.id, { ...a, dann, aktiv }, konto?.id ?? null, a.version)) n++; }
      else { await this.d.repo.setze(a.id, { aktiv }); n++; }
    }
    await einst.schreibe('favoriten_freigabe', null);
    log.info('Freigabe „Favoriten benachrichtigen“ in Automatisierungen übernommen', { erlaubt: f.erlaubt, rollen: f.rollen.length, vorgabe: f.vorgabe, automatisierungen: n });
    return n;
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
      const nieEin = !a.aktiv && a.geaendertVon === null && !(await this.d.dienst.kern.repo.fassungen('automatisierung', a.id)).some((f) => (f.daten as { aktiv?: unknown }).aktiv === true);
      if (nieEin) { await this.d.repo.loesche(a.id); entfernt.push(a.name); }
      else { await this.d.repo.setze(a.id, { herkunft: 'eigen' }); uebernommen.push(a.name); }
    }
    if (entfernt.length || uebernommen.length) {
      log.info('Beispiel-Automatisierungen aus dem Kern aufgeräumt', { entfernt: entfernt.join(', ') || '–', alsEigeneUebernommen: uebernommen.join(', ') || '–' });
    }
    return { entfernt, uebernommen };
  }

  /* ---------- Verwalten ---------- */

  async kontext(): Promise<Kontextdaten> {
    const [k, pakete, liste] = await Promise.all([this.d.dienst.automatisierungshilfen.automatisierungKontext(), this.d.dienst.kern.repo.listePakete(), this.d.repo.liste()]);
    // Pakete für „Paket nach Zeitplan ausführen“ (#1082): ob sie das Ereignis abonnieren und welche Aufgaben ihre
    // mitgelieferten Automatisierungen nennen (zur Auswahl im Editor).
    const aufgaben = (id: string) => [...new Set(liste.filter((a) => a.herkunft === 'paket' && a.paketId === id)
      .flatMap((a) => a.dann.flatMap((d) => (d.art === 'paket' && d.aufgabe ? [d.aufgabe] : []))))].sort();
    // Ziele nach außen (#671): Eine Karte „URL aufrufen“ ohne freigegebenes Ziel ist ein Problem (rot, angehalten).
    return { ...k, pakete: pakete.map((p) => ({ id: p.id, name: p.name, zeitplan: !!p.laeufer?.ereignisse.includes('zeitplan.ausgefuehrt'), aufgaben: aufgaben(p.id) })), ziele: await this.ausleitung.ziele() };
  }

  private async ansicht(a: Automatisierung, k: Kontextdaten, letzte: Map<string, Lauf>, unlesbar: Set<string>, kontoId: string | null): Promise<AutomatisierungAnsicht> {
    const l = letzte.get(a.id);
    const ohne = { ...a } as Automatisierung & { letzterTag?: unknown };
    delete ohne.letzterTag;
    // Darf das Konto „Automatisierung“ den Mappentyp der Wenn-Karte gar nicht lesen, kann sie nie laufen (#709) – nur Hinweis.
    const typ = kontextTyp(a.wenn, k.typen);
    const rechte = typ && unlesbar.has(typ.id) ? { typId: typ.id, typ: typ.name, kontoId, text: t('automatisierung.rechte.warnung', { typ: typ.name }) } : null;
    // „Paket nach Zeitplan ausführen“ (#1082): Paket entfernt oder ohne das Ereignis – Hinweis, die Automatisierung bleibt an.
    const ziel = (d: DannKarte) => (d.art !== 'paket' ? '' : a.herkunft === 'paket' ? a.paketId ?? '' : d.paket);
    const leer = [...new Set(a.dann.flatMap((d) => (ziel(d) ? [paketKarteLeer(ziel(d), k.pakete)] : [])).filter((x): x is string => !!x))];
    // Aufruf von außen (#679): Adresse ohne Geheimnis; je Automatisierung ein eigener Auslöser (laufen nie gemeinsam).
    const aufruf = istAufruf(a.wenn) ? await this.aufrufStand(a.id) : undefined;
    // URL aufrufen (#671): welche Karten ein Geheimnis haben (ohne das Geheimnis).
    const geheimnisse = [...a.dann, ...a.sonst].some((x) => x.art === 'url') ? await this.ausleitung.geheimnisStand(a.id) : undefined;
    return {
      ...ohne, kurz: kurzform(a, k, (art) => (art === 'datum' ? t('automatisierung.wenn.datum') : t.frei(`ereignisse.name.${art.replace(/_/g, '-')}`))), probleme: automatisierungsProbleme(a, k),
      ausloeser: istAufruf(a.wenn) ? `aufruf|${a.id}` : ausloeserSchluessel(a.wenn),
      letzterLauf: l ? { id: l.id, zustand: l.zustand, gestartet: l.gestartet, fehler: l.fehler } : null,
      ...(rechte ? { rechte } : {}),
      ...(leer.length ? { leer } : {}),
      ...(aufruf === undefined ? {} : { aufruf }),
      ...(geheimnisse === undefined ? {} : { geheimnisse }),
    };
  }

  /** Adresse eines Aufrufs von außen für die Karte (#679) – ohne Geheimnis; `oeffentlich`: Adresse von Ablago im Internet. */
  private async aufrufStand(id: string): Promise<(AufrufStand & { oeffentlich: boolean }) | null> {
    const s = await this.aufrufe.stand(id);
    return s && { ...s, oeffentlich: /^https?:\/\//i.test(s.adresse) && oeffentlichErreichbar(s.adresse) };
  }

  /**
   * Adresse anlegen oder erneuern bzw. neues Geheimnis (#679) – nur ausdrücklich über die Werkbank, nie für eine
   * mitgelieferte Automatisierung. Das Geheimnis steht nur in dieser Antwort.
   */
  async aufrufAnlegen(id: string, was: unknown, von: string | null): Promise<AufrufStand & { geheimnis: string; oeffentlich: boolean }> {
    const a = await this.gibt(id);
    const r = await this.aufrufe.lege(a, was === 'geheimnis' ? 'geheimnis' : 'adresse', von);
    return { ...r, oeffentlich: /^https?:\/\//i.test(r.adresse) && oeffentlichErreichbar(r.adresse) };
  }

  /**
   * Ein Aufruf von außen (#679) – Prüfungen in {@link Aufrufe.annehmen}. In Wartung und Wiederherstellung ruht er wie
   * der Zeitplan (503, nichts gezählt, nichts ausgelöst).
   */
  async aufrufAnnehmen(o: Parameters<Aufrufe['annehmen']>[0]) {
    if (this.d.pause?.()) throw new Fachfehler(503, t('automatisierung.aufruf.pause'));
    return this.aufrufe.annehmen(o);
  }

  /** Adresse entfernen (#679): Danach nimmt die Automatisierung keine Aufrufe mehr an, bis eine neue angelegt ist. */
  async aufrufEntfernen(id: string): Promise<void> {
    await this.gibt(id);
    await this.aufrufe.entferne(id, 'von Hand');
  }

  /**
   * Adressen, die Aufrufe von außen annehmen (#679): eingeschaltet, nicht angehalten, mit Wenn-Karte „Aufruf von außen“
   * und angelegter Adresse – für Werkbank-Übersicht und Notfallblatt.
   */
  async aufrufListe(): Promise<Array<{ id: string; name: string; adresse: string }>> {
    const [liste, autos] = await Promise.all([this.aufrufe.liste(), this.d.repo.liste()]);
    return liste.flatMap((e) => {
      const a = autos.find((x) => x.id === e.automatisierungId);
      return a && a.aktiv && !a.angehalten && istAufruf(a.wenn) ? [{ id: a.id, name: a.name, adresse: e.adresse }] : [];
    });
  }

  /**
   * „Alle abschalten“ in der Werkbank-Übersicht (#679): die genannten Automatisierungen, die gerade Aufrufe von außen
   * annehmen, ausschalten – ein Klick. Andere Ids übergeht es. Liefert die Zahl.
   */
  async aufrufeAbschalten(ids: string[], von: string | null): Promise<number> {
    let n = 0;
    for (const x of (await this.aufrufListe()).filter((y) => ids.includes(y.id))) { await this.schalte(x.id, false, von); n++; }
    if (n) log.info('Aufrufe von außen abgeschaltet', { anzahl: n });
    return n;
  }

  /* ---------- Nach außen (#671) ---------- */

  /** Freigegebene Ziele (Werkbank → Automatisierungen → Ziele nach außen). */
  ziele() { return this.ausleitung.ziele(); }

  /**
   * Ziele setzen (ganze Liste, frische Anmeldung). Fällt ein Ziel weg, halten Automatisierungen mit Karten dorthin beim
   * nächsten Lauf an (Problem „Ziel nicht freigegeben“); offene Zustellungen gibt der Ausgangskorb auf.
   */
  async setzeZiele(roh: unknown, von: string | null) {
    const ziele = await this.ausleitung.setzeZiele(roh, von);
    const ohneZiel = (a: Automatisierung) => aussenKarten(a).some((k) => k.art === 'url' && !zielFuer(k.adresse, ziele));
    return { ziele, betroffen: (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && ohneZiel(a)).map((a) => ({ id: a.id, name: a.name })) };
  }

  /** Geheimnis für die Signatur einer Karte „URL aufrufen“ anlegen bzw. erneuern – nur in dieser Antwort. */
  async aussenGeheimnis(id: string, karte: string, von: string | null) {
    return this.ausleitung.geheimnisAnlegen(await this.gibt(id), karte, von);
  }

  /** Geheimnis einer Karte entfernen: Danach gehen ihre Aufrufe ohne Signatur hinaus. */
  async aussenGeheimnisEntfernen(id: string, karte: string) { await this.gibt(id); await this.ausleitung.geheimnisEntfernen(id, karte); }

  /** Zustellungen nach außen einer Automatisierung (ohne Inhalte): Ziel, Zustand, Status, Fehler, Versuche, Zeiten. */
  async zustellungen(id: string): Promise<AusgangVerlauf[]> { await this.gibt(id); return this.ausleitung.verlauf(id); }

  /** Mappentypen, die das Konto „Automatisierung“ überhaupt nicht lesen darf (#709). */
  private async unlesbar(): Promise<{ typen: Set<string>; kontoId: string | null }> {
    const konto = await this.konto().catch(() => null);
    if (!konto) return { typen: new Set(), kontoId: null };
    const z = await this.d.dienst.rechtepruefung.zugriff(konto);
    const typen = new Set<string>();
    for (const typ of await this.d.dienst.mappentypen.listeTypen()) {
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
    const s = await this.d.dienst.sichten.seite(konto, { sicht: `typ:${typ.id}`, suche, anzahl: 20 }, await this.d.dienst.rechtepruefung.zugriff(konto), 20);
    return { mappen: s.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '', typId: m.typId })), gesamt: s.gesamt };
  }

  private async gibt(id: string) {
    const a = await this.d.repo.hole(id);
    if (!a) throw new Fachfehler(404, t('automatisierung.nicht-gefunden'));
    return a;
  }

  /** Speichern geht nur mit gültigem Stand (Fehler mit Gründen); eine neue Automatisierung startet ausgeschaltet. */
  private async pruefe(d: AutomatisierungDaten, wer?: { herkunft: Herkunft; paketId?: string | null; alt?: DannKarte[] }) {
    const k = await this.kontext();
    // Mit dem Bereich im Editor (#1000), damit die Oberfläche ihn öffnet.
    const o = automatisierungsProblemOrte(d, k);
    const p = [...new Set(o.map((x) => x.text))];
    if (p.length) throw new Fachfehler(422, p[0], { probleme: p, orte: [...new Set(o.map((x) => x.ort))] });
    for (const x of [...d.dann, ...d.sonst]) if (x.art !== 'stopp' && !DANN_AUSFUEHRER[x.art]) throw new Fachfehler(422, t('automatisierung.karte.unbekannt', { art: x.art }), { orte: ['dann'] });
    if (wer) this.pruefePaketKarten(d, wer, k);
  }

  /**
   * „Paket nach Zeitplan ausführen“ beim Speichern (#1082, Sicherheit): Eine mitgelieferte Automatisierung ruft nur ihr
   * eigenes Paket; eine selbst angelegte nur Pakete, die `zeitplan.ausgefuehrt` abonnieren – außer die Karte nannte das
   * Paket schon vorher (entfernt: Sie läuft ins Leere und lässt sich trotzdem weiter bearbeiten).
   */
  private pruefePaketKarten(d: AutomatisierungDaten, wer: { herkunft: Herkunft; paketId?: string | null; alt?: DannKarte[] }, k: Kontextdaten) {
    const vorher = new Set((wer.alt ?? []).flatMap((x) => (x.art === 'paket' ? [x.paket] : [])));
    for (const x of [...d.dann, ...d.sonst]) {
      if (x.art !== 'paket') continue;
      if (wer.herkunft === 'paket') { if (x.paket !== wer.paketId) throw new Fachfehler(422, t('automatisierung.paket.nur-eigenes'), { orte: ['dann'] }); continue; }
      if (vorher.has(x.paket)) continue;
      const p = k.pakete?.find((y) => y.id === x.paket);
      if (!p) throw new Fachfehler(422, t('automatisierung.paket.nicht-installiert', { paket: x.paket }), { orte: ['dann'] });
      if (!p.zeitplan) throw new Fachfehler(422, t('automatisierung.paket.ohne-zeitplan', { name: p.name }), { orte: ['dann'] });
    }
  }

  /**
   * Werkbank-Karten (#677): Wer eine Karte einrichtet, die einen Werkbank-Bereich berührt (Sicherung, Gemeldete Fehler,
   * Protokoll, Systemzustand), muss diesen Bereich selbst verwalten dürfen – sonst bekäme er über das Systemkonto mehr, als er
   * darf. Geprüft wird, was gegenüber dem bisherigen Stand dazukommt – und jede Änderung an einer Wenn-Karte der Werkbank
   * (Art, Stufe, Modul, Text; vorher oder nachher): Sonst ließe sich etwa mit dem Filter `enthaelt` am Verlauf ablesen, ob
   * ein Text im Protokoll stand (Sicherheit in PR #1155). Name, an/aus, Und, Dann und Sonst bleiben offen. Ohne `darf`
   * (Pakete, Tests): keine Prüfung.
   */
  private pruefeBereiche(neu: AutomatisierungDaten, alt: AutomatisierungDaten | null, darf?: (bereich: string) => boolean) {
    if (!darf) return;
    const vorher = new Set(alt ? werkbankBereiche(alt) : []);
    const noetig = werkbankBereiche(neu).filter((b) => !vorher.has(b));
    if (alt && !gleicherStand(bereinigeAutomatisierung(alt).wenn, neu.wenn)) for (const b of [wennBereich(alt.wenn), wennBereich(neu.wenn)]) if (b) noetig.push(b);
    const fehlt = noetig.find((b) => !darf(b));
    if (fehlt) throw new Fachfehler(403, t('automatisierung.bereich.fehlt', { bereich: t.frei(`werkbank.bereich.${fehlt}.name`) }));
  }

  async lege(e: unknown, von: string | null, herkunft: Herkunft = 'eigen', darf?: (bereich: string) => boolean): Promise<AutomatisierungAnsicht> {
    if ((await this.d.repo.liste()).length >= AUTOMATISIERUNG_GRENZEN.automatisierungen) throw new Fachfehler(422, t('automatisierung.zuviele', { anzahl: AUTOMATISIERUNG_GRENZEN.automatisierungen }));
    const d = bereinigeAutomatisierung(e);
    this.pruefeBereiche(d, null, darf);
    const roh = (e ?? {}) as Record<string, unknown>;
    if (roh.reihenfolge === undefined) d.reihenfolge = REIHENFOLGE[herkunft];
    await this.pruefe(d, { herkunft });
    const a: Automatisierung = { ...d, id: randomUUID(), aktiv: roh.aktiv === true, angehalten: null, herkunft, version: 1, erstellt: this.iso(), erstelltVon: von, geaendert: this.iso(), geaendertVon: von };
    await this.d.repo.lege(a);
    log.info('Automatisierung angelegt', { id: a.id, name: a.name });
    return this.hole(a.id);
  }

  async aendere(id: string, e: unknown, von: string | null, darf?: (bereich: string) => boolean): Promise<AutomatisierungAnsicht> {
    const alt = await this.gibt(id);
    const roh = (e ?? {}) as Record<string, unknown>;
    const d = bereinigeAutomatisierung({ ...alt, ...roh });
    this.pruefeBereiche(d, alt, darf);
    // Mitgeliefert (#1082): „Paket nach Zeitplan ausführen“ zeigt immer auf das eigene Paket – was auch geschickt wird.
    if (alt.herkunft === 'paket' && alt.paketId) for (const k of [...d.dann, ...d.sonst]) if (k.art === 'paket') k.paket = alt.paketId;
    await this.pruefe(d, { herkunft: alt.herkunft, paketId: alt.paketId, alt: [...alt.dann, ...alt.sonst] });
    const version = Number(roh.version ?? alt.version);
    const aktiv = typeof roh.aktiv === 'boolean' ? roh.aktiv : alt.aktiv;
    if (!(await this.d.repo.speichere(id, { ...d, aktiv }, von, version))) throw new Fachfehler(409, t('automatisierung.konflikt'));
    // Aufruf von außen (#679): Ist die Wenn-Karte keine mehr, gilt auch ihre Adresse nicht mehr.
    if (istAufruf(alt.wenn) && !istAufruf(d.wenn)) await this.aufrufe.entferne(id, 'Wenn-Karte geändert');
    // URL aufrufen (#671): Fällt eine Karte weg, auch ihr Geheimnis.
    const urlKarten = new Set([...d.dann, ...d.sonst].filter((k) => k.art === 'url').map((k) => k.id));
    for (const k of [...alt.dann, ...alt.sonst]) if (k.art === 'url' && !urlKarten.has(k.id)) await this.ausleitung.geheimnisEntfernen(id, k.id);
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
    await this.aufrufe.entferne(id, 'Automatisierung gelöscht');
    // Karten nach außen (#671): in der Datenbank gehen Geheimnisse und Ausgangskorb mit (ON DELETE CASCADE).
    await this.ausleitung.geheimnisEntfernen(id);
    await this.ausleitung.verwerfe(id, 'Automatisierung gelöscht');
    log.info('Automatisierung gelöscht', { id, name: a.name });
  }

  /** Kopie als eigene Automatisierung (ausgeschaltet) – z. B. für einen zweiten Auslöser. */
  async kopiere(id: string, von: string | null, darf?: (bereich: string) => boolean): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    return this.lege({ ...a, name: t('automatisierung.kopie', { name: a.name }).slice(0, AUTOMATISIERUNG_GRENZEN.name), aktiv: false, reihenfolge: a.reihenfolge }, von, 'eigen', darf);
  }

  /** Verlauf; mit `darf` (Anfrage einer Person) ohne Lauf-Daten aus Bereichen, die sie nicht verwaltet ({@link laufFuer}). */
  async laeufe(id: string, anzahl = 50, darf?: (bereich: string) => boolean): Promise<Lauf[]> {
    await this.gibt(id);
    return (await this.d.repo.laeufe(id, Math.max(1, Math.min(AUTOMATISIERUNG_GRENZEN.verlauf, anzahl)))).map((l) => laufFuer(l, darf));
  }
  /** Ein Lauf; ohne `darf` mit allen gespeicherten Daten (Wiederholen), mit `darf` wie {@link laufFuer}. */
  async lauf(id: string, darf?: (bereich: string) => boolean): Promise<Lauf> { const l = await this.d.repo.lauf(id); if (!l) throw new Fachfehler(404, t('automatisierung.lauf.fehlt')); return laufFuer(l, darf); }

  /** Für die Werkbank-Übersicht: fehlgeschlagene Läufe und angehaltene Automatisierungen. */
  async warnungen(): Promise<{ fehlgeschlagen: number; angehalten: Array<{ id: string; name: string; grund: Angehalten['grund'] }>; umgezogen: { am: string; anzahl: number } | null; ohneBenachrichtigungen: boolean; ohnePostFuerDich: boolean;
    /** Adressen, die gerade Aufrufe von außen annehmen (#679) – mit „Abschalten“ in der Übersicht. */
    aufrufe: Array<{ id: string; name: string; adresse: string }> }> {
    const [fehl, liste] = await Promise.all([this.d.repo.fehlgeschlagene(), this.d.repo.liste()]);
    const aktiv = liste.filter((a) => a.aktiv);
    // Was nicht mehr passt (Feld oder Ansicht gelöscht), zählt sofort – nicht erst beim nächsten Lauf.
    const k = aktiv.some((a) => !a.angehalten) ? await this.kontext() : null;
    const angehalten = aktiv.flatMap((a) => (a.angehalten ? [{ id: a.id, name: a.name, grund: a.angehalten.grund }]
      : k && automatisierungsProbleme(a, k).length ? [{ id: a.id, name: a.name, grund: 'fehlerhaft' as const }] : []));
    // Ohne Paket „Benachrichtigungen“ (#678): Keine Automatisierung schickt die Tägliche Zusammenfassung.
    const ohneBenachrichtigungen = !liste.some((a) => a.dann.some((d) => d.art === 'zusammenfassung'));
    // #1001: Keine Automatisierung legt „Post für dich“ an (Paket „Benachrichtigungen“ fehlt oder ist älter als 1.3.0).
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const ohnePostFuerDich = !liste.some((a) => a.aktiv && istPostFuerDich(a, postTyp));
    return { fehlgeschlagen: new Set(fehl.map((l) => l.automatisierungId)).size, angehalten, umgezogen: await this.umzug(), ohneBenachrichtigungen, ohnePostFuerDich, aufrufe: await this.aufrufListe() };
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
    // Werkbank-Karten (#677): ohne Mappe – mit einer Beispielmeldung (der Probelauf ruft nichts ab).
    if (istBetrieb(a.wenn)) {
      const w = a.wenn;
      const zeitpunkt = this.iso();
      const daten: Record<string, unknown> = w.art === 'fehler.gemeldet' ? { fehlermeldung: null, benutzer: null, zeitpunkt, text: t('automatisierung.test.beispiel.fehler') }
        : w.art === 'protokoll.meldung' ? { stufe: w.stufe, modul: w.modul ?? 'system', text: [t('automatisierung.test.beispiel.protokoll'), w.enthaelt].filter(Boolean).join(': '), zeitpunkt }
          : { version: eigeneVersion(), installiert: eigeneVersion() };
      const l = await this.fuehreAus(a, { id: randomUUID(), art: w.art, daten, kette: 0 }, { trocken, test: true });
      return l ?? this.lauf(id);
    }
    // Aufruf von außen (#679): ohne Mappe – mit einem Beispielwert je Parameter.
    if (istAufruf(a.wenn)) {
      const daten = { zeitpunkt: this.iso(), parameter: Object.fromEntries(a.wenn.parameter.map((n) => [n, t('automatisierung.test.beispiel.parameter')])) };
      const l = await this.fuehreAus(a, { id: randomUUID(), art: 'aufruf', daten, kette: 0 }, { trocken, test: true });
      return l ?? this.lauf(id);
    }
    if (!istUuid(mappeId)) throw new Fachfehler(422, t('automatisierung.test.mappe'));
    const k = await this.kontext();
    const typ = kontextTyp(a.wenn, k.typen);
    // Rechte des Kontos „Automatisierung“, nicht die des Admins – die Meldung sagt das auch so (#709).
    const roh = await this.d.dienst.rechtepruefung.pruefeRecht(undefined, mappeId, 'R');
    const m = await this.d.dienst.rechtepruefung.pruefeRecht(await this.d.dienst.postSystemmappen.systemZugriff('automatisierung'), mappeId, 'R').catch((x: unknown) => {
      if (x instanceof Fachfehler && (x.status === 403 || x.status === 404)) throw new Fachfehler(403, t('automatisierung.test.rechte', { typ: k.typen.find((y) => y.id === roh.typId)?.name ?? '' }));
      throw x;
    });
    if (typ && m.typId !== typ.id) throw new Fachfehler(422, t('automatisierung.test.typ', { typ: typ.name }));
    // Zeitplan „für jeden Benutzer“ (#1001, statt „Jetzt senden“ unter Werkbank → Aufgaben): die gewählte Benutzer-Mappe ist der Benutzer des Laufs.
    const daten: Record<string, unknown> = { mappe: m.id, typ: m.typId, ...(a.wenn.art === 'datum' ? { feld: a.wenn.feld, datum: m.werte[a.wenn.feld] ?? null, tage: tageBis(m.werte[a.wenn.feld]) } : {}),
      ...(a.wenn.art === 'zeitplan' && a.wenn.jeBenutzer ? { benutzer: m.id } : {}) };
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
    if (!(e.art in EREIGNISKATALOG) || !wennFaehig(e.art) || e.ausloeser?.still) return;
    const alle = await this.d.repo.liste();
    // „Mappe gespeichert“ mit „auch beim Anlegen“ (#1001) hört zusätzlich auf „Mappe angelegt“.
    let liste = alle.filter((a) => a.aktiv && !a.angehalten && (a.wenn.art === e.art || (e.art === 'mappe.angelegt' && a.wenn.art === 'mappe.geaendert' && a.wenn.angelegt === true)) && this.passt(a, e));
    // Protokollmeldung (#677): je Automatisierung höchstens ein Lauf in der Pause – auch über mehrere Prozesse.
    if (e.art === 'protokoll.meldung') liste = await this.ausserPause(liste);
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
      const datum = await this.d.dienst.automatisierungshilfen.datumVon(mappe, w.feld);
      // Nur im Vorlauf: Datum heute oder später, Erinnerungstag erreicht (auch heute – lief der Zeitplan schon, holt es das nach).
      if (!datum || datum < heute || verschiebe(datum, -w.vorlauf, w.einheit) > heute) continue;
      await this.reihe(liste, { id: uuidAus(`datum|${ausloeserSchluessel(w)}|${mappe}|${datum}`), art: 'datum', daten: { mappe, typ, feld: w.feld, datum, tage: tageBis(datum, heute) }, kette: 0 });
    }
  }

  /** Protokollmeldung (#677): ohne die, die in den letzten {@link PROTOKOLL_ABSTAND_MIN} Minuten schon liefen. */
  private async ausserPause<T extends Automatisierung>(liste: T[]): Promise<T[]> {
    const seit = new Date(this.jetzt() - PROTOKOLL_ABSTAND_MIN * 60_000).toISOString();
    const frei = await Promise.all(liste.map(async (a) => !(await this.d.repo.laeufe(a.id, 5)).some((l) => !l.test && l.zustand !== 'uebersprungen' && l.gestartet >= seit)));
    return liste.filter((_, i) => frei[i]);
  }

  private passt(a: Automatisierung, e: KatalogEreignis): boolean {
    const w = a.wenn;
    // Zeitplan, Datum und Aufruf von außen (#679) löst der Motor selbst aus, nie der Ereigniskatalog.
    if (w.art === 'datum' || w.art === 'zeitplan' || istAufruf(w)) return false;
    if (istBetrieb(w)) return w.art !== 'protokoll.meldung' || protokollPasst(w, e.daten);
    if (EREIGNISKATALOG[w.art].gruppe !== 'benutzer' && w.typ && e.daten.typ !== w.typ) return false;
    if (w.art === 'mappe.geaendert' && e.art === 'mappe.geaendert' && w.felder?.length) { const g = alsListe(e.daten.felder); if (!w.felder.some((f) => g.includes(f))) return false; }
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
      if (l?.zustand === 'abgeschlossen' && l.schritte.some((s) => s.karte && s.zustand === 'ok' && (s.teil === 'sonst' ? a.sonst : a.dann).find((k) => k.id === s.karte)?.art === 'stopp')) stopp = a.name;
    }
  }

  /** Lauf ohne Ausführen festhalten (übersprungen: Kette, Bremse, Stopp, keine Leserechte). */
  private async vermerke(a: Automatisierung, anlass: Anlass, zustand: LaufZustand, text: string) {
    const mappeId = mappeVon(anlass);
    await this.d.repo.beginne({ id: randomUUID(), automatisierungId: a.id, ereignisId: anlass.id, art: anlass.art, daten: anlass.daten, mappeId, zustand, trocken: false, test: false,
      schritte: [{ teil: 'wenn', zustand: 'uebersprungen', text }], fehler: null, gestartet: this.iso(), beendet: this.iso() });
  }

  /** Eine Automatisierung für ein Ereignis ausführen; null, wenn es dazu schon einen Lauf gibt. */
  private async fuehreAus(a: Automatisierung, anlass: Anlass, o: { trocken: boolean; test: boolean; wiederholtVon?: string }): Promise<Lauf | null> {
    const mappeId = mappeVon(anlass);
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
      { teil: 'wenn', zustand: 'ok', text: anlass.art === 'datum' ? t('automatisierung.wenn.datum') : anlass.art === 'zeitplan' ? t('automatisierung.wenn.zeitplan') : anlass.art === 'aufruf' ? t('automatisierung.wenn.aufruf') : t.frei(`ereignisse.name.${anlass.art.replace(/_/g, '-')}`) },
      { teil: 'und', zustand: 'offen' },
      ...a.dann.map((k): Schritt => ({ teil: 'dann', karte: k.id, zustand: 'offen' })),
      // Sonst (#677): eigene Schritte – je Lauf läuft genau einer der beiden Zweige, der andere ist „übersprungen“.
      ...a.sonst.map((k): Schritt => ({ teil: 'sonst', karte: k.id, zustand: 'offen' })),
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
      const z = await this.d.dienst.postSystemmappen.systemZugriff('automatisierung');
      // Mappe mit den Rechten des Systemkontos: Was es nicht lesen darf, sieht die Automatisierung nicht.
      let mappe: Mappe | null = null;
      if (mappeId) {
        try { mappe = await this.d.dienst.rechtepruefung.pruefeRecht(z, mappeId, 'R'); }
        catch (x) {
          if (x instanceof Fachfehler && x.status === 403) { await schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.nicht-lesbar') }); return await ende('uebersprungen'); }
          if (!(x instanceof Fachfehler && x.status === 404)) throw x;
        }
      }
      if (typ && mappe && mappe.typId !== typ.id) { await schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.anderer-typ') }); return await ende('uebersprungen'); }
      const personen = async (e: Empfaenger): Promise<string[]> => {
        if (e.art === 'person') return [e.id];
        if (e.art === 'rolle') return this.d.dienst.automatisierungshilfen.mitgliederDerRolle(e.id);
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
      // Dann – oder Sonst (#677), wenn die Bedingungen nicht zutreffen; ohne Sonst-Karten „trifft nicht zu“.
      const zweig = und.ok ? 'dann' : 'sonst';
      for (let i = 2; i < l.schritte.length; i++) if (l.schritte[i].teil !== zweig) l.schritte[i].zustand = 'uebersprungen';
      if (!und.ok && !a.sonst.length) return await ende('unzutreffend');
      const kontext: KartenKontext = {
        dienst: this.d.dienst, z, konto, automatisierung: a, mappe, typ, daten: anlass.daten, ereignisId: o.test ? l.id : anlass.id, trocken: o.trocken, personen,
        person: anlass.ausloeser?.art === 'benutzer' && istUuid(anlass.ausloeser.id) ? anlass.ausloeser.id : null,
        fuelle: (text) => this.fuelle(text, { a, mappe, typ, z, daten: anlass.daten, art: anlass.art }),
        fuelleFuer: async (text, an) => {
          const c = { a, mappe, typ, z, daten: anlass.daten, art: anlass.art };
          const empf = an ? await this.d.dienst.ohneLeserecht.zugriffVon(an) : null;
          if (!empf) return { text: await this.fuelle(text, c), verborgen: 0, mappe: true };
          const basis = await this.fuelleMit(text, c, null);
          const fuer = await this.fuelleMit(text, c, empf);
          return { text: fuer.text, verborgen: Math.max(0, fuer.verborgen - basis.verborgen), mappe: fuer.mappe };
        },
        anlass: { automatisierung: { id: a.id, name: a.name, eingerichtetVon: a.erstelltVon } },
        werkbank: this.d.werkbank,
        laufId: l.id, anlassArt: anlass.art,
        aussen: { ausleitung: this.ausleitung, basis: this.aussenBasis },
      };
      const begonnen = this.jetzt();
      let leer = 0;
      const karten = und.ok ? a.dann : a.sonst;
      const basis = und.ok ? 2 : 2 + a.dann.length;
      for (let i = 0; i < karten.length; i++) {
        const karte = karten[i];
        const si = i + basis;
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
          const text = await this.d.dienst.kern.mitAusloeser({ art: 'automatisierung', id: a.id, konto: konto.id, kette: anlass.kette + 1 }, () => ausf(karte, kontext));
          await schritt(si, { zustand: 'ok', text });
        } catch (x) {
          const text = (x as Error).message;
          // Ziel fehlt (#1082): übersprungen, die übrigen Karten laufen weiter.
          if (x instanceof KarteLeer) { await schritt(si, { zustand: 'uebersprungen', text }); leer++; continue; }
          await schritt(si, { zustand: 'fehler', text });
          l.schritte.forEach((x, j) => { if (j > si && x.teil === zweig) x.zustand = 'uebersprungen'; });
          return await ende('fehlgeschlagen', text);
        }
      }
      // Liefen alle Karten ins Leere, ist der Lauf übersprungen (zählt nicht als Fehlschlag).
      return await ende(leer && leer === karten.filter((k) => k.art !== 'stopp').length ? 'uebersprungen' : 'abgeschlossen');
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
    const merkmale = flach.some(merkmal) ? await this.d.dienst.werkbank.merkmale() : undefined;
    const mitMappe = flach.filter((k) => !merkmal(k));
    const teile = await Promise.all(mitMappe.map(async (k) => k.art === 'bedingung' ? { art: 'bedingungen' as const, bedingungen: [k.bedingung as Bedingung] }
      : k.art === 'ansicht' ? { art: 'sicht' as const, sicht: k.sicht }
        : { art: 'favorit' as const, benutzer: k.art === 'favorit' ? await personen(k.von) : [] }));
    const erg = mappe && mitMappe.length ? await this.d.dienst.automatisierungshilfen.trifftTeile(mappe.id, teile, ich) : [];
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
  async fuelleMit(text: string, c: { a: Pick<Automatisierung, 'name'>; mappe: Mappe | null; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown>; art?: string }, empf: Zugriff | null): Promise<{ text: string; verborgen: number; mappe: boolean }> {
    const { a, mappe, typ, z, daten } = c;
    const versteckt = t('automatisierung.platzhalter.nicht-sichtbar');
    const mappeSichtbar = !empf || !mappe || (await this.d.dienst.rechtepruefung.lesbare(empf, [mappe.id])).has(mappe.id);
    const refs = mappe && typ ? typ.felder.filter((f) => f.typ === 'referenz').flatMap((f) => alsListe(mappe.werte[f.key])).filter(istUuid) : [];
    const titel = refs.length ? await this.d.dienst.automatisierungshilfen.lesbareTitel(z, refs) : new Map<string, string>();
    if (empf && refs.length) { const ok = await this.d.dienst.rechtepruefung.lesbare(empf, refs); for (const id of [...titel.keys()]) if (!ok.has(id)) titel.delete(id); }
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
    const siehtPersonen = empf && personen.length ? await this.d.dienst.rechtepruefung.lesbare(empf, personen.map((k) => daten[k] as string)) : null;
    for (const k of personen) {
      const id = daten[k] as string;
      if (siehtPersonen && !siehtPersonen.has(id)) { fest[k] = versteckt; verdeckt.add(k); } else fest[k] = await this.d.dienst.kern.name(id);
    }
    if ('von' in daten || 'bis' in daten) {
      fest.von = tag(daten.von); fest.bis = tag(daten.bis);
      fest.zeitraum = fest.von && fest.bis ? t('automatisierung.platzhalter.zeitraum.von-bis', { von: fest.von, bis: fest.bis }) : fest.von ? t('automatisierung.platzhalter.zeitraum.ab', { von: fest.von })
        : fest.bis ? t('automatisierung.platzhalter.zeitraum.bis', { bis: fest.bis }) : t('automatisierung.platzhalter.zeitraum.offen');
    }
    // Werkbank-Karten (#677): Zeitpunkt, Meldung, wer, Version – den Text der Meldung nur für Empfänger, die den Bereich verwalten.
    if (c.art && istBetriebWenn(c.art)) for (const [k, w] of Object.entries(await this.betriebWerte(c.art, daten, empf))) { fest[k] = w.wert; if (w.verdeckt) verdeckt.add(k); }
    // Aufruf von außen (#679): Zeitpunkt und die Parameter – nur Text, nie als Feld oder Code (Ersetzen in einem Durchgang).
    if (c.art === 'aufruf') {
      fest.zeitpunkt = zeitpunktText(daten.zeitpunkt);
      const p = daten.parameter && typeof daten.parameter === 'object' ? daten.parameter as Record<string, unknown> : {};
      for (const [k, w] of Object.entries(p)) if (typeof w === 'string' && !Object.hasOwn(fest, k)) fest[k] = w;
    }
    let verborgen = 0;
    // Post (#1042): {absender} und {fuer} gelten bis 1.0.0 als {von} und {an} (uebergaenge.ts).
    const alias = typ?.system === 'post';
    const erg = text.replace(/\{([a-z][a-z0-9_]*)((?:\|[^{}|]*)*)\}/g, (ganz, key: string) => {
      if (Object.hasOwn(fest, key)) { if (verdeckt.has(key)) verborgen++; return fest[key]; }
      const k = alias ? postKennung(key) : key;
      const f = typ?.felder.find((x) => x.key === k);
      if (!f || f.typ === 'passwort' || !mappe) return ganz;
      if (!mappeSichtbar) { verborgen++; return versteckt; }
      let fehlt = false;
      const w = titelAus({ felder: typ!.felder, titelVorlage: alias ? postVorlageNeu(ganz) : ganz }, mappe.werte, (id) => { const x = titel.get(id); if (x === undefined) fehlt = true; return x ?? versteckt; });
      if (fehlt) verborgen++;
      return w;
    });
    return { text: erg, verborgen, mappe: mappeSichtbar };
  }

  /**
   * Platzhalter der Werkbank-Karten (#677). Text und Absender einer Fehlermeldung bzw. der Text einer Protokollmeldung
   * sieht ein Empfänger nur, wenn er „Gemeldete Fehler“ bzw. „Protokoll“ verwalten darf – sonst „(nicht sichtbar)“.
   */
  private async betriebWerte(art: string, daten: Record<string, unknown>, empf: Zugriff | null): Promise<Record<string, { wert: string; verdeckt?: boolean }>> {
    const darf = (bereich: string) => !empf || darfBereich(empf.ich, bereich);
    const leer = Object.fromEntries((BETRIEB_PLATZHALTER[art as keyof typeof BETRIEB_PLATZHALTER] ?? []).map((k) => [k, { wert: '' }]));
    const sicht = (wert: string, sieht: boolean) => (sieht ? { wert } : { wert: t('automatisierung.platzhalter.nicht-sichtbar'), verdeckt: true });
    if (art === 'fehler.gemeldet') {
      const sieht = darf(SYSTEMKONTO_WERKBANK.fehlermeldung);
      const m = sieht && typeof daten.fehlermeldung === 'string' ? await this.d.werkbank?.fehlermeldung(daten.fehlermeldung) : null;
      const von = sieht && typeof daten.benutzer === 'string' && istUuid(daten.benutzer) ? await this.d.dienst.kern.name(daten.benutzer) : '';
      return { ...leer, zeitpunkt: { wert: zeitpunktText(daten.zeitpunkt) }, meldung: sicht(m?.text ?? alsText(daten.text), sieht), gemeldet_von: sicht(von, sieht) };
    }
    if (art === 'protokoll.meldung') {
      return { ...leer, zeitpunkt: { wert: zeitpunktText(daten.zeitpunkt) }, stufe: { wert: istStufe(daten.stufe) ? t.frei(`automatisierung.stufe.${daten.stufe}`) : '' },
        modul: { wert: typeof daten.modul === 'string' ? t.frei(`werkbank.protokoll.modul.${daten.modul}`) : '' }, meldung: sicht(alsText(daten.text), darf(SYSTEMKONTO_WERKBANK.protokoll)) };
    }
    return { ...leer, version: { wert: alsText(daten.version) }, installiert: { wert: alsText(daten.installiert) } };
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
              for (const mappe of await this.d.dienst.automatisierungshilfen.mappenMitDatum(w.typ, w.feld, ziel)) {
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
      await this.versionPruefen(ort);
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
  /** Merker in den Einstellungen (mehrere Server: wer den Tag einträgt, macht den Lauf); ohne Speicher im Arbeitsspeicher. */
  private merker(schluessel: string): Merker {
    const einst = this.d.dienst.kern.einstellungen;
    if (einst) return { lies: async () => { const v = await einst.lies(schluessel); return typeof v === 'string' ? v : null; }, beanspruche: async (alt, tag) => {
      if (einst.tausche) return einst.tausche(schluessel, alt, tag);
      if (((await einst.lies(schluessel)) ?? null) !== alt) return false;
      await einst.schreibe(schluessel, tag); return true;
    } };
    return { lies: async () => this.merkerOhneSpeicher.get(schluessel) ?? null, beanspruche: async (alt, tag) => { if ((this.merkerOhneSpeicher.get(schluessel) ?? null) !== alt) return false; this.merkerOhneSpeicher.set(schluessel, tag); return true; } };
  }

  /**
   * Wenn-Karte „Neue Version verfügbar“ (#677): einmal am Tag (ab 06:00, verpasst am selben Tag nachgeholt) fragen –
   * nur, solange eine solche Automatisierung an ist. Je Version genau ein Ereignis (Merker `automatisierung_version`).
   */
  private async versionPruefen(ort: { datum: string; uhr: string }) {
    const w = this.d.werkbank;
    if (!w || !(await this.d.repo.liste()).some((a) => a.aktiv && !a.angehalten && a.wenn.art === 'version.neu')) return;
    await laufeFaellige(this.merker('automatisierung_version_geprueft'), ort, { uhrzeit: '06:00', an: () => true }, async () => {
      const neu = await w.neueVersion().catch((x: Error) => { log.info('Neue Version nicht geprüft', { fehler: x.message }); return null; });
      if (!neu) return;
      const gemeldet = this.merker('automatisierung_version');
      const alt = await gemeldet.lies();
      if (alt === neu || !(await gemeldet.beanspruche(alt, neu))) return;
      await this.d.dienst.kern.ereignis('version.neu', { version: neu, installiert: eigeneVersion() }, null);
    });
  }

  private async zeitplanKarten(ort: { datum: string; uhr: string }) {
    const alle = (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'zeitplan');
    if (!alle.length) return;
    const einst = this.d.dienst.kern.einstellungen;
    // Feiertage nach Werkbank → Region (#726; bis dahin stand das Bundesland bei der Täglichen Zusammenfassung).
    const roh = ((await einst?.lies('aufgaben_mail')) ?? {}) as { bundesland?: unknown };
    const region = einst ? liesRegion(await einst.lies('region'), roh.bundesland) : null;
    const bundesland = region ? region.bundesland : istBundesland(roh.bundesland) ? roh.bundesland : null;
    const merker = (schluessel: string) => this.merker(schluessel);
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
          // zeitpunkt (#1082): der geplante Zeitpunkt, für „Paket nach Zeitplan ausführen“.
          await this.reihe(liste, { id: uuidAus(`zeitplan|${schluessel}|${tag}`), art: 'zeitplan', daten: { tag, zeitpunkt: zeitpunktIn(tag, w.uhrzeit) }, kette: 0 });
        });
        continue;
      }
      const wer = w.rolle ? new Set(await this.d.dienst.automatisierungshilfen.mitgliederDerRolle(w.rolle)) : null;
      for (const b of k.benutzer) {
        if (b.aktiv === false || (wer && !wer.has(b.id))) continue;
        let t_ = takt(w.uhrzeit, w.tage, w.feiertage);
        if (w.profilzeit) {
          // Wie bisher die Tägliche Zusammenfassung: Uhrzeit, Wochentage und Feiertage aus dem Profil, sonst die Karte.
          const z = wirksameZeit((await this.d.dienst.mappen.persoenlicheEinstellungen(b.id)).aufgaben_mail_zeit, { aktiv: true, uhrzeit: w.uhrzeit, bundesland });
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

/** Werkbank-Karten (#677): Text aus dem Ereignis (sonst leer), Zeitpunkt kurz in der Sprache der Ablage, Stufe. */
const alsText = (v: unknown) => (typeof v === 'string' ? v : '');
const zeitpunktText = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? datumsformat(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '');
const istStufe = (v: unknown): v is 'warn' | 'error' => v === 'warn' || v === 'error';

/** Tage von `ab` (Vorgabe heute) bis zum Datum – Platzhalter {tage}; leer ohne Datum. */
function tageBis(datum: unknown, ab = heuteIn()): number | null {
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${ab}T12:00:00Z`)) / 86_400_000);
}
