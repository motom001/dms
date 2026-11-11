/**
 * Mehrere Prozesse (#745): Was der Leiter für die anderen Prozesse erledigt und was jeder Prozess vom anderen wissen muss.
 *
 * - **Anstöße an den Leiter** (Meldung ohne Antwort): Texterkennung, Vorschaubilder, Ereignisse verteilen. Die anderen
 *   Prozesse arbeiten das nie selbst ab – sonst liefen Vorschaubilder und Texterkennung mehrfach gleichzeitig, und ein
 *   Ereignisverteiler ohne die Abnehmer der Automatisierungen hätte Ereignisse als verteilt markiert.
 * - **Aufrufe beim Leiter** (mit Ergebnis): Sicherung, Prüfsumme, Probe und Wiederherstellung starten, Postfach abrufen,
 *   Eingangsordner prüfen, Vorschaubilder nachholen. Was dort läuft, spiegelt der Leiter jede Sekunde an alle
 *   (`laeuft()`/`aktuellerLauf()` bleiben in jedem Prozess gleich und ohne Warten).
 * - **Einstellungen im Arbeitsspeicher** (Schlüssel der Verschlüsselung, E-Mail-Versand, OIDC, Schwelle der
 *   Zeitmessung): Jeder Prozess liest alle 2 Sekunden den Haushaltsstand `lesen` (#741); hat er sich geändert, lädt er
 *   sie neu. Das gilt auch für weitere Server an derselben Datenbank.
 * - **Werkbank-Aufträge, hochgeladene Pakete, eigene Änderungen der Zähler**: im Kurzzustand (#744) bzw. auf der Platte,
 *   siehe `auftrag.ts`, `pakete.ts`, `zaehlerspeicher.ts`.
 */
import type postgres from 'postgres';
import type { Betrieb } from './betrieb';
import type { Verbindungswarten } from './db';
import type { Dienst } from './dienst';
import type { Eingangsordner } from './eingangsordner';
import type { Kurzzustand } from './kurzzustand';
import { bedieneLaeufer, type Fernlaeufer } from './laeufer/fern';
import type { Paketlaeufer } from './laeufer/verwaltung';
import type { Messung } from './messung';
import type { Oidc } from './oidc';
import type { Poolmessung, PoolStand } from './poolmessung';
import type { Postfaecher } from './postfach';
import { protokoll } from './protokoll';
import type { Verbund } from './prozesse';
import type { Lauf, Sicherung } from './sicherung';
import type { Texterkennung } from './texterkennung';
import type { Tresor } from './tresor';
import type { Ueberlastschutz } from './ueberlast';
import type { Vorschaubilder } from './vorschau';
import type { Wiederherstellung, Wiederherstellungslauf } from './wiederherstellung';
import { MB } from './grenzen';

const log = protokoll.modul('system');

/** Temporäre Uploads, die beim Start eines Prozesses neben anderen noch liegen, löscht er erst ab diesem Alter. */
export const UPLOAD_ALTER_MS = 6 * 3600_000;
/** So oft spiegelt der Leiter laufende Sicherungen und Wiederherstellungen an die anderen. */
export const SPIEGEL_MS = 1000;
/** So oft prüft jeder Prozess, ob sich Einstellungen geändert haben (Haushaltsstand `lesen`). */
export const NACHLADEN_MS = 2000;

/** Was alle Prozesse über Sicherung und Wiederherstellung wissen (vom Leiter). */
export interface Spiegel { sicherung: Lauf | null; wiederherstellung: Wiederherstellungslauf | null; whLaeuft: boolean }

/** Stand eines Prozesses für Systemzustand und Lasttest. */
export interface Prozessstand {
  rssMb: number; heapMb: number;
  /** Rechenzeit dieses Prozesses in Prozent eines Kerns seit der letzten Abfrage (mindestens 1 s, sonst die davor). */
  cpu: number | null;
  schleife: { median: number; p99: number; max: number } | null; schleifeWarnung: string | null;
  anfragen: ReturnType<Ueberlastschutz['stand']>;
  verbindungen: { max: number; median: number | null; p95: number | null };
  /** Nur für den Lasttest (`prozess.last`, #874): Wartezeit auf Verbindungen und belegte Verbindungen dieses Prozesses. */
  pool?: PoolStand;
}

/** Für ein Dokument genügt dem Leiter, was die Vorschaubilder brauchen. */
type VorschauDok = { sha256: string; mime: string; groesse: number; name: string };
const klein = (docs: VorschauDok[]): VorschauDok[] => docs.filter(Boolean).map((d) => ({ sha256: d.sha256, mime: d.mime, groesse: d.groesse, name: d.name }));

export interface TeilungsDeps {
  dienst: Dienst;
  texterkennung: Texterkennung;
  vorschau: Vorschaubilder;
  sicherung: Sicherung;
  wiederherstellung: Wiederherstellung;
  postfaecher: Postfaecher;
  eingangsordner: Eingangsordner;
  paketlaeufer: Paketlaeufer | null;
  fernlaeufer: Fernlaeufer | null;
  tresor: Tresor;
  betrieb: Betrieb;
  oidc: Oidc;
  messung: Messung;
  zustand: Kurzzustand;
  sql: postgres.Sql;
  haushalt: string;
  ueberlast: Ueberlastschutz;
  verbindungen: Verbindungswarten;
  /** Wartezeit auf eine freie Verbindung (#874), nur für den Lasttest. */
  pool?: Poolmessung;
  einstellungen?: unknown;
}

let cpuVorher: { t: number; u: NodeJS.CpuUsage; wert: number | null } | null = null;
function cpuJetzt(): number | null {
  const t = performance.now(), u = process.cpuUsage();
  if (!cpuVorher) { cpuVorher = { t, u, wert: null }; return null; }
  if (t - cpuVorher.t < 1000) return cpuVorher.wert;
  const wert = Math.round(((u.user + u.system - cpuVorher.u.user - cpuVorher.u.system) / 1000 / (t - cpuVorher.t)) * 1000) / 10;
  cpuVorher = { t, u, wert };
  return wert;
}

/** Stand dieses Prozesses (für `frageAlle('prozess.stand')`). */
export function prozessstand(o: Pick<TeilungsDeps, 'messung' | 'ueberlast' | 'verbindungen'>): Prozessstand {
  const m = process.memoryUsage();
  const s = o.messung.auslastung.stand();
  const w = s.aktuell && (s.aktuell.seitSekunden >= 5 || !s.vorher) ? s.aktuell : s.vorher ?? s.aktuell;
  const v = o.verbindungen.stand();
  return {
    rssMb: Math.round(m.rss / MB), heapMb: Math.round(m.heapUsed / MB), cpu: cpuJetzt(),
    schleife: w ? { median: w.median, p99: w.p99, max: w.max } : null, schleifeWarnung: s.warnungSeit,
    anfragen: o.ueberlast.stand(), verbindungen: { max: v.max, median: v.median, p95: v.p95 },
  };
}

export function teileArbeit(v: Verbund, o: TeilungsDeps): { start(): Promise<void>; stop(): void } {
  const uhren: NodeJS.Timeout[] = [];
  v.bediene('prozess.stand', () => prozessstand(o));
  // Lasttest (#874): schaltet die Messung der Wartezeit auf Verbindungen ein (für einige Minuten) und liefert sie mit.
  v.bediene('prozess.last', () => { o.pool?.an(); return { ...prozessstand(o), ...(o.pool ? { pool: o.pool.stand() } : {}) }; });
  cpuJetzt();

  // Zustand, der über die Prozesse geteilt werden muss (nur mit mehreren; ein Prozess bleibt wie bisher).
  if (v.mehrere) {
    o.dienst.auftraege.teile(o.zustand);
    o.dienst.stand.teileEigene(o.zustand);
    o.dienst.mappenstand.teileEigene(o.zustand);
    // Einstellungen im Arbeitsspeicher neu laden, sobald sich der Haushaltsstand `lesen` ändert.
    let stand: string | null = null;
    let nochmal = false;
    let laeuft = false;
    const pruefe = async () => {
      if (laeuft) return;
      laeuft = true;
      try {
        const [r] = await o.sql`SELECT lesen FROM haushaltsstand WHERE haushalt_id = ${o.haushalt}`;
        const neu = r ? String(r.lesen) : '';
        if (stand !== null && (neu !== stand || nochmal)) {
          const ok = await o.tresor.nachladen();
          await o.betrieb.nachladen();
          o.oidc.vergiss();
          await o.messung.start();
          nochmal = !ok;
        }
        stand = neu;
      } catch (e) { log.debug('Einstellungen nicht abgeglichen', { fehler: (e as Error).message }); } finally { laeuft = false; }
    };
    void pruefe();
    uhren.push(setInterval(() => void pruefe(), NACHLADEN_MS));
  }

  if (v.leiter) {
    const { texterkennung: te, vorschau: vs, sicherung: si, wiederherstellung: wh } = o;
    v.hoere('texterkennung.anstossen', () => te.anstossen());
    v.hoere('vorschau.einreihen', (d) => vs.einreihen(d as VorschauDok[]));
    v.hoere('vorschau.ausFassung', (d) => vs.ausFassung(d as VorschauDok[]));
    v.bediene('vorschau.nachholen', ([d]) => vs.nachholen(d as VorschauDok[]));
    v.hoere('ereignisse.wecke', () => o.dienst.ereignisse.wecke());
    v.bediene('postfach.abrufen', ([id]) => o.postfaecher.abrufen(String(id)));
    v.bediene('eingang.pruefe', ([sofort]) => o.eingangsordner.pruefe(sofort === true));
    v.bediene('sicherung.starte', async ([art, von]) => (await si.starte(art as Parameters<Sicherung['starte']>[0], String(von))).lauf);
    v.bediene('sicherung.pruefe', ([name, von]) => si.pruefe(String(name), String(von)));
    v.bediene('wiederherstellung.starte', ([e, admin, code]) => wh.starte(e as Parameters<Wiederherstellung['starte']>[0], admin as { email: string } | null, code));
    v.bediene('wiederherstellung.probe', async ([name, von]) => (await wh.starteProbe(name === null ? null : String(name), String(von))).lauf);
    const spiegel = (): Spiegel => ({ sicherung: si.aktuellerLauf(), wiederherstellung: wh.aktuellerLauf(), whLaeuft: wh.laeuft() });
    v.bediene('spiegel', () => spiegel());
    if (o.paketlaeufer) bedieneLaeufer(v, o.paketlaeufer, o.dienst);
    if (v.mehrere) {
      let zuletzt = '';
      uhren.push(setInterval(() => {
        const s = spiegel();
        const j = JSON.stringify(s);
        if (j !== zuletzt) { zuletzt = j; v.melde('spiegel', s, 'andere'); }
      }, SPIEGEL_MS));
    }
    for (const u of uhren) u.unref?.();
    return { start: async () => {}, stop: () => { for (const u of uhren) clearInterval(u); } };
  }

  // ---------- Weitere Prozesse: Hintergrundarbeit an den Leiter ----------
  const { texterkennung: te, vorschau: vs, sicherung: si, wiederherstellung: wh, dienst } = o;
  te.anstossen = () => v.melde('texterkennung.anstossen');
  vs.anstossen = () => {};
  vs.einreihen = (docs) => { const d = klein(docs as VorschauDok[]); if (d.length) v.melde('vorschau.einreihen', d); return d.length; };
  vs.ausFassung = (docs) => { const d = klein(docs as VorschauDok[]); if (d.length) v.melde('vorschau.ausFassung', d); return d.length; };
  vs.nachholen = (docs) => v.rufe<number>('vorschau.nachholen', [klein(docs as VorschauDok[])]);
  dienst.ereignisse.wecke = () => v.melde('ereignisse.wecke');
  dienst.ereignisse.verteile = async () => { v.melde('ereignisse.wecke'); return 0; };
  o.postfaecher.abrufen = (id) => v.rufe<number>('postfach.abrufen', [id]);
  o.eingangsordner.pruefe = (sofort = false) => v.rufe<number>('eingang.pruefe', [sofort]);

  let s: Spiegel = { sicherung: null, wiederherstellung: null, whLaeuft: false };
  v.hoere('spiegel', (x) => { s = x as Spiegel; });
  si.aktuellerLauf = () => (s.sicherung ? { ...s.sicherung } : null);
  si.laeuft = () => s.sicherung?.status === 'laeuft';
  si.starte = async (art, von) => ({ lauf: await v.rufe<Lauf>('sicherung.starte', [art, von]), fertig: Promise.resolve(null) });
  // Gibt hier ein Versprechen statt des Laufs zurück; die Route wartet darauf (await).
  si.pruefe = ((name: string, von: string) => v.rufe<Lauf>('sicherung.pruefe', [name, von])) as unknown as Sicherung['pruefe'];
  wh.aktuellerLauf = () => (s.wiederherstellung ? { ...s.wiederherstellung } : null);
  wh.laeuft = () => s.whLaeuft;
  wh.starte = (e, admin, code) => v.rufe<Wiederherstellungslauf>('wiederherstellung.starte', [e, admin ? JSON.parse(JSON.stringify(admin)) : null, code]);
  wh.starteProbe = async (name, von) => ({ lauf: await v.rufe<Wiederherstellungslauf>('wiederherstellung.probe', [name, von]), fertig: Promise.resolve(false) });

  for (const u of uhren) u.unref?.();
  return {
    start: async () => { s = await v.rufe<Spiegel>('spiegel').catch(() => s); },
    stop: () => { for (const u of uhren) clearInterval(u); },
  };
}
