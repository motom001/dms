/**
 * Paket-Läufer (#338), Seite des DMS: startet und überwacht den Läufer-Prozess, gibt ihm die Pakete mit Code,
 * stellt Ereignisse zu (mit Wiederholung) und führt Anfragen der Pakete an die API aus – jeweils mit dem
 * Schlüssel des Dienstkontos des Pakets. Der Schlüssel verlässt diesen Prozess nie.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WIEDERHOLEN_MIN } from '../../../shared/src/ereignisse';
import type { Benutzer } from '../../../shared/src/model';
import { hatNetz, hatSchnittstelle, type InstalliertesPaket, type LaeuferZustand, type PaketCode, type Schnittstelle } from '../../../shared/src/pakete';
import { adressfelder, pruefeAdresse } from '../../../shared/src/paketeinstellungen';
import { liesModell, liesVektor, SCHWELLE_STANDARD } from '../vektoren';
import type { ApiSchluesselDienst } from '../apischluessel';
import type { Dienst } from '../dienst';
import type { PaketEreignis } from '../repo';
import type { Konten } from '../konten';
import type { PaketLaeufer } from '../pakete';
import { ladeArgumente } from './modul';
import { protokoll } from '../protokoll';
import { senkePrioritaet, senkeProzess } from '../hintergrund';
import type { AnLaeufer, Grenzen, NetzEintrag, VomLaeufer } from './prozess';
import { gebietsschema } from '../../../shared/src/sprache';
import type { Hostantwort } from './arbeiter';
import { t, t as tx } from '../sprache';
import { beantworteZugang, type AktionsDatei, type Zugang } from '../paketaktionen';

/** Eingeschränkter Zugriff eines laufenden Aufrufs einer Paket-Aktion (#1039). */
interface AktionsZugang { paket: string; zugang: Zugang; dateien: AktionsDatei[] }
import { GB, KB, MB, PAKET_SPEICHER_MAX as SPEICHER_MAX, WEITER_MAX_BYTES } from '../grenzen';

const log = protokoll.modul('werkbank');

export const STANDARD_GRENZEN: Grenzen = { speicherMB: 256, sekunden: 120, parallel: 2 };
/** Wiederholungen nach Fehlschlag: 1, 5, 30 Minuten, 2, 6 Stunden – danach aufgegeben. */
const WARTEN_MIN = WIEDERHOLEN_MIN;
/** Höchstens so viele Fortsetzungen je Ereignis (#458) – danach gilt es als zugestellt. */
export const WEITER_MAX = 500;
export { WEITER_MAX_BYTES };

/**
 * Fortsetzung eines Ereignisses (#458): Antwortet ein Paket mit `{"weiter": {…}}` (Ergebnis als JSON, Code 0), ist es
 * noch nicht fertig – z. B. ein langes Dokument, das nicht in die Zeitgrenze eines Aufrufs passt. Der Läufer ruft es
 * gleich wieder auf, mit denselben Daten und zusätzlich `weiter` (was das Paket mitgegeben hat) und `abschnitt`.
 * null: keine Fortsetzung (auch bei zu großen Daten).
 */
export function liesWeiter(text: string): Record<string, unknown> | null {
  if (!text.startsWith('{') || !text.includes('"weiter"') || text.length > WEITER_MAX_BYTES) return null;
  try {
    const j = JSON.parse(text) as { weiter?: unknown };
    return j.weiter && typeof j.weiter === 'object' && !Array.isArray(j.weiter) ? j.weiter as Record<string, unknown> : null;
  } catch { return null; }
}

const LETZTE = 20;
/** Nachberechnung der Vektoren (#442): alle so viele ms höchstens so viele Dokumente – nur, wenn das Paket nichts offen hat. */
const NACHLAUF_MS = 30_000;
const NACHLAUF_JE_RUNDE = 50;
/** Nach einem vollständigen Durchgang erst nach dieser Zeit wieder von vorn (Dokumente, deren Vektor fehlschlug). */
const NACHLAUF_PAUSE_MS = 6 * 3600_000;
/** Gleiche Netzaufrufe (#807) so kurz hintereinander – auch über mehrere Aufrufe – stehen in einem Eintrag. */
export const NETZ_ZUSAMMEN_MS = 60_000;
/** So viele Einträge im Protokoll eines Pakets (Ausgaben und Netzaufrufe) höchstens. */
const PROTOKOLL_MAX = 50;

/** „0 B“, „512 B“, „3,4 KB“, „12,1 MB“ – in der Sprache der Oberfläche. */
export function bytesText(n: number): string {
  const z = (x: number) => x.toLocaleString(gebietsschema(), { maximumFractionDigits: 1 });
  return n < KB ? `${n} B` : n < MB ? `${z(n / KB)} KB` : n < GB ? `${z(n / MB)} MB` : `${z(n / GB)} GB`;
}

/** Text eines Netzaufrufs im Protokoll des Pakets (#807): Anzahl, Methode, Host, Status, Bytes – nie Inhalte. */
export function netzText(e: NetzEintrag): string {
  if (e.abgelehnt) return t('meldungen.verwaltung.netz-abgelehnt', { anzahl: e.anzahl, methode: e.methode, host: e.host });
  return t('meldungen.verwaltung.netz-aufruf', { anzahl: e.anzahl, methode: e.methode, host: e.host, status: e.status ?? t('meldungen.verwaltung.netz-ohne-antwort'), hin: bytesText(e.hin), zurueck: bytesText(e.zurueck) });
}

type Protokolleintrag = { zeit: string; stufe: number; text: string; netz?: NetzEintrag };

/**
 * Netzaufrufe eines Aufrufs ins Protokoll eines Pakets (#807): Gleiche (Methode, Host, Status, abgelehnt) innerhalb von
 * NETZ_ZUSAMMEN_MS zählen in den vorhandenen Eintrag – so fluten Teile-Uploads das Protokoll nicht. Abgelehnte als Warnung.
 */
export function merkeNetz(protokoll: Protokolleintrag[], neu: NetzEintrag[], max = PROTOKOLL_MAX): void {
  const gleich = (a: NetzEintrag, b: NetzEintrag) => a.methode === b.methode && a.host === b.host && a.status === b.status && !!a.abgelehnt === !!b.abgelehnt;
  for (const n of neu) {
    let i = protokoll.length - 1;
    while (i >= 0 && !(protokoll[i].netz && gleich(protokoll[i].netz!, n) && Date.parse(n.zeit) - Date.parse(protokoll[i].netz!.bis) <= NETZ_ZUSAMMEN_MS)) i--;
    const e: NetzEintrag = i >= 0 ? { ...protokoll[i].netz!, anzahl: protokoll[i].netz!.anzahl + n.anzahl, hin: protokoll[i].netz!.hin + n.hin, zurueck: protokoll[i].netz!.zurueck + n.zurueck, bis: n.bis } : { ...n };
    if (i >= 0) protokoll.splice(i, 1);
    protokoll.push({ zeit: e.bis, stufe: e.abgelehnt ? 2 : 1, text: netzText(e), netz: e });
  }
  if (protokoll.length > max) protokoll.splice(0, protokoll.length - max);
}

/** Anfrage an die eigene API (im Betrieb über fastify.inject, ohne Netz). */
export type ApiAufruf = (a: { methode: string; pfad: string; kopf: Record<string, string>; body?: Buffer }) => Promise<{ status: number; kopf: Record<string, string>; body: Buffer }>;

/**
 * Recht des API-Schlüssels eines Dienstkontos: „lesen und schreiben“, sobald das Paket irgendetwas schreiben darf –
 * Mappen, Dokumente, Vektoren (#442), Fassungen (#577, dms:umwandeln), Volltext (#614, dms:volltext), Archivfassungen (#631). Pakete für die Kopie außer
 * Haus (#585, dms:sicherung-lesen) lesen nur: Ihren Stand melden sie in der Antwort auf das Ereignis (#636). Was es genau darf, prüft die Route je Recht.
 */
export const schluesselRecht = (c: PaketCode): 'lesen' | 'schreiben' =>
  c.rechte.schreiben.length || c.rechte.dokumente === 'schreiben' || hatSchnittstelle(c, 'dms:vektoren') || hatSchnittstelle(c, 'dms:hinweise') || hatSchnittstelle(c, 'dms:umwandeln') || hatSchnittstelle(c, 'dms:volltext') || hatSchnittstelle(c, 'dms:archivfassung') ? 'schreiben' : 'lesen';

export interface LaeuferOptionen {
  dienst: Dienst;
  konten: Konten;
  schluessel: ApiSchluesselDienst;
  api: ApiAufruf;
  /** Einstellungen eines Pakets im Klartext (nur für das Paket selbst). */
  einstellungen: (paket: string) => Promise<Record<string, unknown>>;
  /** Kleiner eigener Speicher je Paket (Schlüssel → Wert). */
  speicher: { lies(paket: string): Promise<Record<string, string>>; schreibe(paket: string, werte: Record<string, string>): Promise<void> };
  /** Im Wartungsmodus keine Aufrufe. */
  pausiert?: () => boolean;
  grenzen?: Partial<Grenzen>;
  /** Tests: kürzere Abstände. */
  abrufMs?: number;
  /** Tests: weniger Fortsetzungen je Ereignis (#458, Standard WEITER_MAX). */
  weiterMax?: number;
  nachlaufMs?: number;
  /** Tests (#900): erste Nachberechnung nach dem Laden der Pakete (Standard 1 s); lang = nur ausdrücklich aufgerufen. */
  nachlaufErstMs?: number;
}

export interface PaketStand {
  id: string; name: string; version: string; dienstkonto: string | null;
  geladen: boolean; fehler: string | null;
  aufrufe: number; fehlgeschlagen: number; letzterAufruf: string | null; dauerMs: number | null; speicherMB: number | null;
  ereignisse: { offen: number; aufgegeben: number; zugestellt: number };
  letzte: Array<{ zeit: string; art: string; ok: boolean; text: string }>;
  /** Ausgaben des Pakets und seine Netzaufrufe (#807, mit `netz`). */
  protokoll: Array<{ zeit: string; stufe: number; text: string; netz?: NetzEintrag }>;
}

interface Aufruf { ok: (r: Extract<VomLaeufer, { art: 'ergebnis' }>) => void; teil?: (text: string) => void }
type Ergebnis = Extract<VomLaeufer, { art: 'ergebnis' }> & { ohneVersuch?: boolean };
/** Ergebnis ohne Aufruf (Läufer beendet, abgestürzt, Zeit abgelaufen). ohneVersuch: zählt nicht als Versuch des Ereignisses. */
const abbruch = (fehler: string, ohneVersuch = false): Ergebnis => ({ art: 'ergebnis', nr: 0, paket: '', ok: false, rc: null, text: '', ms: 0, speicherMB: 0, fehler, ohneVersuch });

export class Paketlaeufer implements PaketLaeufer {
  private kind: ChildProcess | null = null;
  private bereit = false;
  private schluessel = new Map<string, string>();
  private konto = new Map<string, Benutzer>();
  private pakete: InstalliertesPaket[] = [];
  private ladefehler = new Map<string, string | null>();
  private stand = new Map<string, Omit<PaketStand, 'id' | 'name' | 'version' | 'dienstkonto' | 'geladen' | 'fehler' | 'ereignisse'>>();
  private aufrufe = new Map<number, Aufruf>();
  private nr = 1;
  private uhr: ReturnType<typeof setInterval> | null = null;
  /** Pakete, deren Ereignisse gerade zugestellt werden (je Paket eine Kette, damit ein langsames Paket die anderen nicht bremst). */
  private zustellend = new Set<string>();
  private holend = false;
  /** Abgleich der Pakete nacheinander (mehrere Installationen kurz hintereinander, #338-Review). */
  private abgleich: Promise<void> = Promise.resolve();
  private schluesselRecht = new Map<string, string>();
  private neustarts = 0;
  private aus = false;
  /** Zeitpunkt des letzten Absturzes (für die Werkbank, #403). */
  private absturz: string | null = null;
  /** Was der laufende Läufer-Prozess schon hat: Paket → Stand (Version, Modul, Zeitpunkt). Nur Geändertes wird neu geschickt (#403). */
  private gesendet = new Map<string, string>();
  readonly grenzen: Grenzen;
  /** Nachberechnung der Vektoren je Paket (#442): Modell, Stelle im Bestand, Pause nach vollständigem Durchgang. */
  private nachlauf = new Map<string, { modell: string; nach: string | null; pauseBis: number }>();
  private nachlaufUhr: ReturnType<typeof setInterval> | null = null;
  private nachlaufLaeuft = false;
  /** Laufende Aufrufe von Paket-Aktionen (#1039): Aufruf-Nummer → Paket, eingeschränkter Zugriff, abgelegte Dateien. */
  private zugaenge = new Map<number, AktionsZugang>();

  constructor(private o: LaeuferOptionen) {
    this.grenzen = { ...STANDARD_GRENZEN, ...o.grenzen };
    o.dienst.ereignisWecker = () => void this.stelleZu();
    // Vektoren (#442): Der Kern fragt das Paket mit dms:vektoren nach dem Vektor eines Suchbegriffs.
    o.dienst.vektorAnbieter = { paket: () => this.vektorPaket(), vektorFuer: (t, ms) => this.vektorFuer(t, ms) };
    // „Frag deine Ablage“ (#444): Das Paket mit dms:antworten beantwortet Fragen aus den Ausschnitten des Kerns.
    o.dienst.fragen.anbieter = {
      paket: () => this.paketMit('dms:antworten'),
      antworte: (paket, eingang, teil) => this.schnittstelle(paket, 'dms:antworten', eingang, { bezeichnung: t('meldungen.verwaltung.frage-beantwortet'), teil }),
    };
    // „Aus Dokument ausfüllen“ per Paket (#511): Pakete mit dms:erkennen, mit Zeitlimit.
    o.dienst.erkennung.anbieter = {
      pakete: () => this.pakete.filter((x) => hatSchnittstelle(x.laeufer, 'dms:erkennen') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
        .map((x) => ({ id: x.id, name: x.name, netz: hatNetz(x.laeufer) })),
      erkenne: (paket, eingang, ms) => this.schnittstelle(paket, 'dms:erkennen', eingang, { bezeichnung: t('meldungen.verwaltung.felder-erkannt'), ms }),
    };
    // „Wohin gehört das?“ (#939): Pakete mit dms:klassifizieren, mit Zeitlimit; kein Inhalt in der Werkbank.
    o.dienst.erkennung.klassifizierung.anbieter = {
      pakete: () => this.klassifizierPakete(),
      klassifiziere: (paket, eingang, ms) => this.schnittstelle(paket, 'dms:klassifizieren', eingang, { bezeichnung: t('meldungen.verwaltung.typ-vorgeschlagen'), ms }),
    };
    // Paket-Aktionen im Menü „Mappe“ (#1039): Schritt mit Antwort und Zeitgrenze, mit eingeschränktem Zugriff.
    o.dienst.paketaktionen.laeufer = { geladen: (paket) => this.aktionBereit(paket), rufe: (paket, eingang, a) => this.mappenaktion(paket, eingang, a) };
    // Inhalte übersetzen (#732): Pakete mit dms:uebersetzen, je Abschnitt ein Aufruf mit Zeitlimit; kein Inhalt in der Werkbank.
    o.dienst.uebersetzung.anbieter = {
      pakete: () => this.uebersetzPakete(),
      uebersetze: (paket, eingang, ms) => this.schnittstelle(paket, 'dms:uebersetzen', eingang, { bezeichnung: t('meldungen.verwaltung.text-uebersetzt'), ms }),
    };
  }

  /** Startet den Läufer, wenn es Pakete mit Code gibt; sonst erst, wenn eins installiert wird. */
  async start() {
    this.aus = false;
    await this.synchronisiere();
    this.uhr ??= setInterval(() => void this.stelleZu(), this.o.abrufMs ?? 5000);
    this.uhr.unref?.();
    this.nachlaufUhr ??= setInterval(() => void this.nachberechnen(), this.o.nachlaufMs ?? NACHLAUF_MS);
    this.nachlaufUhr.unref?.();
  }

  async stop() {
    this.aus = true;
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
    if (this.nachlaufUhr) clearInterval(this.nachlaufUhr);
    this.nachlaufUhr = null;
    const k = this.kind; this.kind = null; this.bereit = false;
    this.beendeAufrufe(abbruch(t('meldungen.verwaltung.der-paket-laeufer-wurde'), true));
    if (k && k.exitCode === null) { k.kill(); await new Promise((ok) => { k.once('exit', ok); setTimeout(ok, 2000); }); }
  }

  /** Offene Aufrufe beenden – sonst warten Zustellung oder Aktion für immer. */
  private beendeAufrufe(r: Ergebnis) {
    const offen = [...this.aufrufe.values()];
    this.aufrufe.clear();
    for (const a of offen) a.ok(r);
  }

  /* ---------- PaketLaeufer (für die Paketverwaltung) ---------- */

  codeGeaendert(): Promise<void> { this.nachlauf.clear(); this.suchvektoren.clear(); return this.synchronisiere().catch((e) => log.error('Paket-Läufer: Pakete nicht neu geladen', { fehler: (e as Error).message })); }


  ereignis(paket: string, name: 'paket.einstellungen_geaendert', felder: string[]) { void this.o.dienst.auftrag(paket, name, { felder }); }

  async aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>): Promise<string> {
    if (this.o.pausiert?.()) throw new Error('Während der Wartung laufen keine Pakete. Bitte danach noch einmal.');
    const r = await this.rufe(paket, 'aktion', { aktion, einstellungen });
    if (!r.ok) throw new Error(r.fehler ?? 'Die Aktion ist fehlgeschlagen.');
    return r.text || 'Erledigt.';
  }

  /** Paket-Aktionen (#1039): fehlerfrei geladene Pakete (für den Schnappschuss der anderen Prozesse). */
  aktionPakete(): string[] { return this.pakete.filter((p) => this.ladefehler.has(p.id) && !this.ladefehler.get(p.id)).map((p) => p.id); }

  /** Paket-Aktionen (#1039): Läuft der Läufer und hat er das Paket fehlerfrei geladen? */
  aktionBereit(paket: string): boolean { return this.laeuft() && this.ladefehler.has(paket) && !this.ladefehler.get(paket); }

  /**
   * Ein Schritt einer Paket-Aktion (#1039): Aufruf mit Antwort und Zeitgrenze, vor die Warteschlange. Fragen aus diesem
   * Aufruf beantwortet der eingeschränkte Zugriff (nie das Dienstkonto); abgelegte Dateien kommen mit dem Ergebnis.
   */
  async mappenaktion(paket: string, eingang: Record<string, unknown>, a: { ms: number; zugang: Zugang; bezeichnung: string }): Promise<{ ok: boolean; text: string; fehler: string | null; dateien: AktionsDatei[] }> {
    if (this.o.pausiert?.()) return { ok: false, text: '', fehler: t('meldungen.verwaltung.der-paket-laeufer-laeuft'), dateien: [] };
    const dateien: AktionsDatei[] = [];
    const r = await this.rufe(paket, 'aktion', eingang, { ms: a.ms, vorrang: true, bezeichnung: a.bezeichnung, zugang: { zugang: a.zugang, dateien }, ohneInhalt: true });
    return { ok: r.ok, text: r.text, fehler: r.fehler, dateien };
  }

  /* ---------- Pakete und Dienstkonten ---------- */

  private synchronisiere(): Promise<void> {
    const weiter = this.abgleich.then(() => this.synchronisiereJetzt());
    this.abgleich = weiter.catch(() => {});
    return weiter;
  }

  private async synchronisiereJetzt() {
    const alle = await this.o.dienst.kern.repo.listePakete();
    this.pakete = alle.filter((p) => p.laeufer?.modul);
    // Dienstkonten: je Paket mit Code eins; für entfernte ausschalten.
    for (const p of this.pakete) {
      const b = await this.o.konten.dienstkonto(p.id, p.name);
      this.konto.set(p.id, b);
      const recht = schluesselRecht(p.laeufer!);
      // Neuen Schlüssel nur für neue Pakete oder geänderte Rechte – laufende Aufrufe der anderen behalten ihren.
      if (!this.schluessel.has(p.id) || this.schluesselRecht.get(p.id) !== `${b.id}:${recht}`) {
        this.schluessel.set(p.id, await this.o.schluessel.fuerDienstkonto(b, recht));
        this.schluesselRecht.set(p.id, `${b.id}:${recht}`);
      }
    }
    for (const b of await this.o.konten.listeDienstkonten()) {
      if (b.aktiv && b.paketId && !this.pakete.some((p) => p.id === b.paketId)) { await this.o.konten.dienstkontoAus(b.paketId); this.schluessel.delete(b.paketId); this.schluesselRecht.delete(b.paketId); this.konto.delete(b.paketId); }
    }
    // Auch entfernte Pakete: ihre Konten bleiben als Paket-Konten bekannt (Historie), lösen aber nichts mehr aus.
    this.o.dienst.paketKonten = new Map((await this.o.konten.listeDienstkonten()).filter((b) => b.paketId).map((b) => [b.id, b.paketId!]));
    if (!this.pakete.length) { if (this.kind) await this.beendeKind(); return; }
    if (!this.kind) this.starteKind();
    else if (this.bereit) await this.sendePakete();
  }

  /** Schickt dem Läufer die Pakete – Code aus der Datenbank nur für neue und geänderte; unveränderte behält er (#403). */
  private async sendePakete() {
    const liste: Extract<AnLaeufer, { art: 'pakete' }>['pakete'] = [];
    const behalten: string[] = [];
    const gesendet = new Map<string, string>();
    for (const p of this.pakete) {
      const adressen = await this.adressen(p);
      // Zusatzdaten (#458, z. B. Sprachen der Texterkennung): Daten von Paketen, die von diesem abhängen, unter „<paket>/<datei>“.
      const zusaetze = this.pakete.filter((q) => q.id !== p.id && p.id in (q.abhaengigkeiten ?? {}) && q.laeufer?.daten?.length);
      const stand = JSON.stringify([p.version, p.laeufer!.modul, p.laeufer!.daten ?? [], p.laeufer!.netz, adressen, p.aktualisiert ?? p.installiert, zusaetze.map((q) => [q.id, q.version, q.laeufer!.daten, q.aktualisiert ?? q.installiert])]);
      if (this.gesendet.get(p.id) === stand) { behalten.push(p.id); gesendet.set(p.id, stand); continue; }
      const code = await this.o.dienst.kern.repo.paketCode(p.id);
      const modul = code.find((d) => d.name === 'modul.wasm');
      if (!modul) { this.ladefehler.set(p.id, 'Der Code fehlt (nach einer Wiederherstellung bitte das Paket neu installieren).'); continue; }
      const daten = code.filter((d) => d.name.startsWith('daten/')).map((d) => ({ name: d.name.slice('daten/'.length), inhalt: new Uint8Array(d.inhalt) }));
      for (const q of zusaetze) {
        for (const d of await this.o.dienst.kern.repo.paketCode(q.id)) if (d.name.startsWith('daten/')) daten.push({ name: `${q.id}/${d.name.slice('daten/'.length)}`, inhalt: new Uint8Array(d.inhalt) });
      }
      liste.push({ id: p.id, version: p.version, modul: new Uint8Array(modul.inhalt), daten, netz: p.laeufer!.netz, adressen });
      gesendet.set(p.id, stand);
    }
    this.gesendet = gesendet;
    this.sende({ art: 'pakete', pakete: liste, behalten, grenzen: this.grenzen });
  }

  /**
   * Bestätigte Dienst-Adressen eines Pakets (#444): Werte der Einstellungen vom Typ adresse. Gespeichert wird eine
   * Adresse nur nach Bestätigung (Paketverwaltung); hier wird sie zur Sicherheit noch einmal geprüft.
   */
  private async adressen(p: InstalliertesPaket): Promise<string[]> {
    if (!p.einstellungen || !p.laeufer?.adressen?.length) return [];
    const werte = await this.o.einstellungen(p.id).catch(() => ({} as Record<string, unknown>));
    return adressfelder(p.einstellungen).map((f) => werte[f.schluessel]).filter((v): v is string => typeof v === 'string' && !!v && !pruefeAdresse(v));
  }

  /** Prozess-Id des Läufers, solange er läuft – für den Systemzustand (#409). */
  get pid(): number | null { return this.kind?.pid ?? null; }

  private starteKind() {
    if (this.aus) return;
    const hier = fileURLToPath(import.meta.url);
    const ts = hier.endsWith('.ts');
    // .mjs: Node liest dann keine package.json außerhalb von dist/ (die das Berechtigungsmodell sperrt).
    const pfad = join(dirname(hier), ts ? 'prozess.ts' : 'prozess.mjs');
    // Im Betrieb mit dem Berechtigungsmodell von Node: nur Lesen im Programmordner, Worker erlaubt, sonst nichts
    // (kein Schreiben, keine Kindprozesse, kein Zugriff auf Schlüssel und Daten des DMS).
    // Gebaut liegen prozess.mjs und arbeiter.mjs neben index.js in dist/ (siehe „build“ in package.json); nur diesen Ordner lesen.
    const rechte = ts || process.env.DMS_LAEUFER_OHNE_BERECHTIGUNGEN === '1' ? [] : ['--permission', '--allow-worker', `--allow-fs-read=${dirname(hier)}`, '--disable-warning=SecurityWarning'];
    const kind = fork(pfad, [], { serialization: 'advanced', execArgv: [...ladeArgumente(process.execArgv), ...rechte], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { NODE_ENV: process.env.NODE_ENV ?? 'production', PATH: process.env.PATH ?? '' } });
    this.kind = kind;
    // Niedrigere Priorität (#893): gleich der Hauptfaden (spätere Fäden erben sie), bei „bereit“ alle Fäden.
    if (kind.pid) senkePrioritaet(kind.pid);
    this.bereit = false;
    this.gesendet = new Map(); // neuer Prozess: alles laden
    let zuletzt = '';
    kind.stdout?.on('data', (d: Buffer) => log.info('Paket-Läufer', { ausgabe: d.toString('utf8').slice(0, 500) }));
    kind.stderr?.on('data', (d: Buffer) => { const t = d.toString('utf8'); zuletzt = (zuletzt + t).slice(-600); log.warn('Paket-Läufer', { ausgabe: t.slice(0, 500) }); });
    kind.on('message', (m: VomLaeufer) => void this.verarbeite(m));
    kind.on('exit', (code, sig) => {
      if (this.kind !== kind) return;
      this.kind = null; this.bereit = false;
      if (!this.aus) this.absturz = new Date().toISOString();
      this.beendeAufrufe(abbruch(t('meldungen.verwaltung.der-paket-laeufer-ist', { wert: String(sig ?? code), wert2: zuletzt.trim() ? `: ${zuletzt.trim().split('\n').slice(-3).join(' ')}` : '' })));
      if (this.aus) return;
      log.error('Paket-Läufer beendet – Neustart', { code, signal: sig, neustarts: this.neustarts, ausgabe: zuletzt.slice(-300) });
      const warte = Math.min(60_000, 1000 * 2 ** Math.min(this.neustarts++, 6));
      setTimeout(() => { if (!this.aus && !this.kind && this.pakete.length) this.starteKind(); }, warte).unref?.();
    });
  }

  private async beendeKind() {
    const k = this.kind; this.kind = null; this.bereit = false;
    this.beendeAufrufe(abbruch(t('meldungen.verwaltung.der-paket-laeufer-wurde-2'), true));
    if (k) k.kill();
  }

  private sende(m: AnLaeufer) { this.kind?.send(m); }

  private async verarbeite(m: VomLaeufer) {
    switch (m.art) {
      case 'bereit': if (this.kind?.pid) senkeProzess(this.kind.pid); this.bereit = true; this.neustarts = 0; await this.sendePakete(); void this.stelleZu(); return;
      case 'geladen':
        for (const p of m.pakete) { this.ladefehler.set(p.id, p.fehler); if (p.fehler) log.warn('Paket-Läufer: Modul abgelehnt', { paket: p.id, fehler: p.fehler }); }
        // Vektoren (#442): gleich das Modell erfragen und den Zwischenspeicher laden, nicht erst nach 30 s.
        if (this.vektorPaket() && !this.nachlauf.has(this.vektorPaket()!)) setTimeout(() => void this.nachberechnen(), this.o.nachlaufErstMs ?? 1000).unref?.();
        return;
      case 'log': this.notiere(m.paket, { stufe: m.stufe, text: m.text }); return;
      case 'ergebnis': { const a = this.aufrufe.get(m.nr); this.aufrufe.delete(m.nr); a?.ok(m); return; }
      case 'teil': { try { this.aufrufe.get(m.nr)?.teil?.(m.text); } catch { /* Empfänger weg */ } return; }
      case 'frage': this.sende({ art: 'antwort', nr: m.nr, antwort: await this.beantworte(m.paket, m.anfrage, m.aufruf).catch((e) => ({ status: 500, body: new TextEncoder().encode((e as Error).message) })) }); return;
    }
  }

  /**
   * API-Anfragen eines Pakets – immer mit seinem eigenen Schlüssel, nur unter /api/v1. Ausnahme Paket-Aktionen (#1039):
   * Kommt die Frage aus einem Aufruf einer Aktion, gilt nur deren eingeschränkter Zugriff (diese Mappe) – nie das
   * Dienstkonto; den eigenen Speicher darf das Paket dann nur lesen.
   */
  private async beantworte(paket: string, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage'], aufruf?: number): Promise<Hostantwort> {
    const zugang = aufruf === undefined ? undefined : this.zugaenge.get(aufruf);
    return (zugang ? await this.aktionsFrage(paket, zugang, q) : null) ?? this.mitDienstkonto(paket, q);
  }

  /** Speicher und API mit dem Schlüssel des Dienstkontos (alles außer Paket-Aktionen). */
  private async mitDienstkonto(paket: string, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage']): Promise<Hostantwort> {
    const t = (status: number, s: string): Hostantwort => ({ status, body: new TextEncoder().encode(s) });
    if (q.art === 'speicher_lesen' || q.art === 'speicher_schreiben') {
      const werte = await this.o.speicher.lies(paket);
      if (q.art === 'speicher_lesen') return q.schluessel in werte ? { status: 200, body: new TextEncoder().encode(werte[q.schluessel]) } : t(404, '');
      const neu = { ...werte, [q.schluessel.slice(0, 200)]: new TextDecoder().decode(q.wert) };
      if (JSON.stringify(neu).length > SPEICHER_MAX) return t(413, `Der Speicher eines Pakets ist auf ${SPEICHER_MAX / KB} KB begrenzt.`);
      await this.o.speicher.schreibe(paket, neu);
      return t(200, '');
    }
    if (q.art !== 'api') return t(400, 'Unbekannte Anfrage.');
    const s = this.schluessel.get(paket);
    if (!s) return t(401, 'Kein Dienstkonto.');
    let a: { methode?: string; pfad?: string; typ?: string; body?: unknown };
    try { a = JSON.parse(q.json); } catch { return t(400, 'Ungültige Anfrage (JSON).'); }
    const methode = String(a.methode ?? 'GET').toUpperCase();
    const pfad = String(a.pfad ?? '');
    if (!/^\/[^\s]*$/.test(pfad) || pfad.includes('..') || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methode)) return t(400, 'Ungültiger Pfad oder ungültige Methode.');
    const body = q.body ? Buffer.from(q.body) : a.body !== undefined ? Buffer.from(JSON.stringify(a.body)) : undefined;
    const kopf: Record<string, string> = { authorization: `Bearer ${s}`, ...(body ? { 'content-type': q.body ? String(a.typ ?? 'application/octet-stream') : 'application/json' } : {}) };
    const r = await this.o.api({ methode, pfad: `/api/v1${pfad}`, kopf, body });
    return { status: r.status, body: new Uint8Array(r.body) };
  }

  /**
   * Frage aus dem Aufruf einer Paket-Aktion (#1039): API nur über den eingeschränkten Zugriff, eigener Speicher nur
   * lesen (null = wie sonst), fremdes Paket mit derselben Nummer abgelehnt.
   */
  private async aktionsFrage(paket: string, zugang: AktionsZugang, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage']): Promise<Hostantwort | null> {
    const t = (status: number, s: string): Hostantwort => ({ status, body: new TextEncoder().encode(s) });
    if (zugang.paket !== paket) return t(403, '');
    if (q.art === 'speicher_schreiben') return t(403, tx('meldungen.paketaktionen.zugang-verboten'));
    if (q.art !== 'api') return null;
    let a: { methode?: string; pfad?: string; typ?: string };
    try { a = JSON.parse(q.json); } catch { return t(400, 'Ungültige Anfrage (JSON).'); }
    const pfad = String(a.pfad ?? '');
    if (!/^\/[^\s]*$/.test(pfad) || pfad.includes('..')) return t(400, 'Ungültiger Pfad.');
    const r = await beantworteZugang(zugang.zugang, zugang.dateien, { methode: String(a.methode ?? 'GET').toUpperCase(), pfad, ...(q.body ? { body: Buffer.from(q.body) } : {}), ...(a.typ ? { typ: String(a.typ) } : {}) }, (sha) => this.o.dienst.kern.liesGanz(sha));
    return { status: r.status, body: new Uint8Array(r.body) };
  }

  private notiere(paket: string, e: { stufe: number; text: string }) {
    const s = this.standVon(paket);
    s.protokoll.push({ zeit: new Date().toISOString(), ...e });
    if (s.protokoll.length > PROTOKOLL_MAX) s.protokoll.splice(0, s.protokoll.length - PROTOKOLL_MAX);
    (e.stufe >= 2 ? log.warn : log.info).call(log, `Paket ${paket}: ${e.text}`, { paket });
  }

  private standVon(paket: string) {
    let s = this.stand.get(paket);
    if (!s) { s = { aufrufe: 0, fehlgeschlagen: 0, letzterAufruf: null, dauerMs: null, speicherMB: null, letzte: [], protokoll: [] }; this.stand.set(paket, s); }
    return s;
  }

  /* ---------- Vektoren (#442) ---------- */

  /** Das Paket mit dem Recht dms:vektoren (bei mehreren das erste nach Id), sofern der Läufer es geladen hat. */
  vektorPaket(): string | null {
    const p = this.pakete.filter((x) => hatSchnittstelle(x.laeufer, 'dms:vektoren') && !this.ladefehler.get(x.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
    return p?.id ?? null;
  }

  /**
   * Fragt das Paket nach dem Vektor eines Textes: Aktion „dms:vektor“ mit { text }; Antwort (Ergebnis) als JSON
   * { modell, vektor, schwelle? }. Leerer Text: nur das Modell. null = kein Paket, keine Antwort in ms, Fehler.
   */
  async vektorFuer(text: string, ms: number): Promise<{ paket: string; modell: string; vektor: Float32Array; schwelle: number } | null> {
    // Die Suche fragt beim Tippen oft nach demselben Begriff: die letzten Antworten merken.
    const k = text.trim().toLowerCase();
    const alt = this.suchvektoren.get(k);
    if (alt && alt.paket === this.vektorPaket()) return alt;
    const r = await this.vektorAnfrage(text, ms);
    if (!r?.vektor) return null;
    const erg = { paket: r.paket, modell: r.modell, vektor: r.vektor, schwelle: r.schwelle };
    this.suchvektoren.set(k, erg);
    if (this.suchvektoren.size > 100) this.suchvektoren.delete(this.suchvektoren.keys().next().value!);
    return erg;
  }
  private suchvektoren = new Map<string, { paket: string; modell: string; vektor: Float32Array; schwelle: number }>();

  private async vektorAnfrage(text: string, ms: number): Promise<{ paket: string; modell: string; vektor: Float32Array | null; schwelle: number } | null> {
    const paket = this.vektorPaket();
    if (!paket || !this.laeuft()) return null;
    const r = await this.rufe(paket, 'aktion', { aktion: 'dms:vektor', text: text.slice(0, 2000) }, { ms, vorrang: true, bezeichnung: text ? t('meldungen.verwaltung.vektor-eines-suchbegriffs') : t('meldungen.verwaltung.modell-abfragen') });
    if (!r.ok) return null;
    try {
      const j = JSON.parse(r.text) as { modell?: unknown; vektor?: unknown; schwelle?: unknown };
      const s = Number(j.schwelle);
      return { paket, modell: liesModell(j.modell), vektor: text ? liesVektor(j.vektor) : null, schwelle: Number.isFinite(s) && s > -1 && s < 1 ? s : SCHWELLE_STANDARD };
    } catch (e) {
      this.notiere(paket, { stufe: 2, text: t('meldungen.verwaltung.antwort-auf-dms-vektor', { message: (e as Error).message }) });
      return null;
    }
  }

  /**
   * Nachberechnung im Hintergrund (#442): Dokumente mit Volltext ohne Vektor des aktuellen Modells bekommen
   * gedrosselt ein Ereignis „volltext.fertig“ – nur, wenn das Paket gerade nichts offen hat. So holt das Paket
   * den Bestand nach (nach der Installation, nach einem Modellwechsel, nach „Neu berechnen“).
   */
  async nachberechnen(): Promise<void> {
    const paket = this.vektorPaket();
    if (!paket || this.nachlaufLaeuft || !this.laeuft()) return;
    const p = this.pakete.find((x) => x.id === paket)!;
    if (!p.laeufer?.ereignisse.includes('volltext.fertig')) return;
    this.nachlaufLaeuft = true;
    try {
      let n = this.nachlauf.get(paket);
      if (!n) {
        const r = await this.vektorAnfrage('', 30_000);
        if (!r) return;
        await this.o.dienst.merkeVektorModell(paket, r.modell);
        n = { modell: r.modell, nach: null, pauseBis: 0 };
        this.nachlauf.set(paket, n);
      }
      if (Date.now() < n.pauseBis) return;
      if (((await this.o.dienst.kern.repo.ereignisStand())[paket]?.offen ?? 0) > 0) return;
      const ids = await this.o.dienst.vektorNachlauf(paket, n.modell, NACHLAUF_JE_RUNDE, n.nach);
      if (ids.length) n.nach = ids[ids.length - 1];
      else { n.nach = null; n.pauseBis = Date.now() + NACHLAUF_PAUSE_MS; }
    } catch (e) {
      log.warn('Paket-Läufer: Nachberechnung der Vektoren unterbrochen', { paket, fehler: (e as Error).message });
    } finally { this.nachlaufLaeuft = false; }
  }

  /** „Neu berechnen“ (Werkbank): Vektoren weg, Nachberechnung sofort von vorn. */
  async vektorenNeu(): Promise<{ entfernt: number }> {
    const paket = this.vektorPaket();
    if (!paket) throw new Error('Es ist kein Paket mit dem Recht „dms:vektoren“ installiert.');
    const r = await this.o.dienst.vektorenNeu(paket);
    this.nachlauf.delete(paket);
    void this.nachberechnen();
    return r;
  }

  /* ---------- Antworten (#444) und Erkennen (#511) ---------- */

  /** Geladene Pakete mit dms:klassifizieren (#939); vektoren: liefert auch die Vektoren (Ähnlichkeit). */
  klassifizierPakete(): Array<{ id: string; name: string; netz: boolean; vektoren: boolean }> {
    return this.pakete.filter((x) => hatSchnittstelle(x.laeufer, 'dms:klassifizieren') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
      .map((x) => ({ id: x.id, name: x.name, netz: hatNetz(x.laeufer), vektoren: hatSchnittstelle(x.laeufer, 'dms:vektoren') }));
  }

  /** Geladene Pakete mit dms:uebersetzen (#732). */
  uebersetzPakete(): Array<{ id: string; name: string; version: string; netz: boolean }> {
    return this.pakete.filter((x) => hatSchnittstelle(x.laeufer, 'dms:uebersetzen') && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id))
      .map((x) => ({ id: x.id, name: x.name, version: x.version, netz: hatNetz(x.laeufer) }));
  }

  /** Das Paket mit dieser Schnittstelle (bei mehreren das erste nach Id), sobald der Läufer es fehlerfrei geladen hat. */
  paketMit(s: Schnittstelle): { id: string; name: string } | null {
    const p = this.pakete.filter((x) => hatSchnittstelle(x.laeufer, s) && this.ladefehler.has(x.id) && !this.ladefehler.get(x.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
    return p ? { id: p.id, name: p.name } : null;
  }

  /**
   * Ruft eine Schnittstelle eines Pakets auf (Aktion `dms:antworten`, `dms:erkennen`, `dms:klassifizieren` bzw. `dms:uebersetzen`): Eingang als JSON, Teile
   * der Antwort an `teil`, Ergebnis als Text. Ohne Inhalt in der Werkbank. Wirft mit verständlicher Meldung.
   */
  async schnittstelle(paket: string, aktion: string, eingang: Record<string, unknown>, opt: { bezeichnung: string; teil?: (text: string) => void; ms?: number }): Promise<{ text: string; ms: number }> {
    if (this.o.pausiert?.()) throw new Error('Während der Wartung laufen keine Pakete.');
    if (!this.laeuft()) throw new Error('Der Paket-Läufer läuft gerade nicht.');
    const r = await this.rufe(paket, 'aktion', { ...eingang, aktion }, { vorrang: true, ohneInhalt: true, bezeichnung: opt.bezeichnung, ...(opt.teil ? { teil: opt.teil } : {}), ...(opt.ms ? { ms: opt.ms } : {}) });
    if (!r.ok) throw new Error(r.fehler ?? 'Das Paket hat nicht geantwortet.');
    return { text: r.text, ms: r.ms };
  }

  /** Einen Aufruf ausführen und auf das Ergebnis warten. ms: eigene, kürzere Wartezeit; vorrang: vor die Warteschlange. */
  private async rufe(paket: string, art: 'ereignis' | 'aktion', eingang: Record<string, unknown>, opt: { ms?: number; vorrang?: boolean; bezeichnung?: string; teil?: (text: string) => void; ohneInhalt?: boolean; zugang?: Omit<AktionsZugang, 'paket'> } = {}): Promise<Ergebnis> {
    if (!this.kind || !this.bereit) return abbruch(t('meldungen.verwaltung.der-paket-laeufer-laeuft'), true);
    const p = this.pakete.find((x) => x.id === paket);
    if (!p) throw new Error('Dieses Paket hat keinen Code.');
    const nr = this.nr++;
    // Paket-Aktion (#1039): Fragen aus diesem Aufruf gehen an den eingeschränkten Zugriff, nicht ans Dienstkonto.
    if (opt.zugang) this.zugaenge.set(nr, { paket, ...opt.zugang });
    const json = JSON.stringify({ ...eingang, paket: { id: p.id, version: p.version }, einstellungen: eingang.einstellungen ?? await this.o.einstellungen(paket).catch(() => ({})) });
    // Eigene Zeitgrenze über der des Läufers: Antwortet der Läufer gar nicht mehr, hängt hier nichts.
    const r = await new Promise<Ergebnis>((ok) => {
      const uhr = setTimeout(() => { if (this.aufrufe.delete(nr)) ok(abbruch(opt.ms ? t('meldungen.verwaltung.keine-antwort-innerhalb-von', { ms: opt.ms }) : t('meldungen.verwaltung.der-paket-laeufer-hat'))); }, opt.ms ?? this.grenzen.sekunden * 1000 + 15_000);
      uhr.unref?.();
      this.aufrufe.set(nr, { ok: (x) => { clearTimeout(uhr); ok(x); }, ...(opt.teil ? { teil: opt.teil } : {}) });
      this.sende({ art: 'aufruf', nr, paket, eingang: { art, json }, ...(opt.vorrang ? { vorrang: true } : {}) });
    }).finally(() => this.zugaenge.delete(nr));
    const s = this.standVon(paket);
    s.aufrufe++; if (!r.ok) s.fehlgeschlagen++;
    s.letzterAufruf = new Date().toISOString(); s.dauerMs = r.ms; s.speicherMB = r.speicherMB;
    // Das Ergebnis kann lang sein (Vektor als JSON, #442): in der Werkbank nur der Anfang.
    // ohneInhalt (#444): Fragen und Antworten stehen nirgends – in der Werkbank nur Länge bzw. Fehler.
    const anzeige = opt.ohneInhalt && r.ok ? `${r.text.length} Zeichen` : (r.ok ? r.text : (r.fehler ?? ''));
    s.letzte.push({ zeit: s.letzterAufruf, art: opt.bezeichnung ?? (art === 'aktion' ? `Aktion ${String(eingang.aktion)}` : String(eingang.art)), ok: r.ok, text: anzeige.slice(0, 300) });
    if (s.letzte.length > LETZTE) s.letzte.splice(0, s.letzte.length - LETZTE);
    if (!r.ok) log.warn(`Paket ${paket}: Aufruf fehlgeschlagen`, { paket, art, fehler: r.fehler, ms: r.ms });
    // Netzaufrufe (#807): ins Protokoll des Pakets und eine Zeile mit der Summe ins Systemprotokoll – Hosts und Bytes, nie Inhalte.
    if (r.netz?.length) {
      merkeNetz(s.protokoll, r.netz);
      const summe = (f: (x: NetzEintrag) => number) => r.netz!.reduce((a, x) => a + f(x), 0);
      log.info(`Paket ${paket}: Netzaufrufe`, {
        paket, aufruf: opt.bezeichnung ?? (art === 'aktion' ? `Aktion ${String(eingang.aktion)}` : String(eingang.art)),
        anfragen: summe((x) => (x.abgelehnt ? 0 : x.anzahl)), abgelehnt: summe((x) => (x.abgelehnt ? x.anzahl : 0)),
        hosts: [...new Set(r.netz.map((x) => x.host))].join(', '), hin: summe((x) => x.hin), zurueck: summe((x) => x.zurueck),
      });
    }
    return r;
  }

  private laeuft() { return !!this.kind && this.bereit && !this.aus && !this.o.pausiert?.(); }

  /**
   * Fällige Ereignisse zustellen: je Paket eine eigene Kette, der Reihe nach. Schlägt ein Ereignis fehl,
   * warten die späteren desselben Pakets, bis es zugestellt oder aufgegeben ist (siehe faelligeEreignisse).
   */
  async stelleZu(): Promise<void> {
    if (this.holend || !this.laeuft()) return;
    this.holend = true;
    try {
      const liste = await this.o.dienst.kern.repo.faelligeEreignisse(50);
      const jePaket = new Map<string, typeof liste>();
      for (const e of liste) jePaket.set(e.paketId, [...(jePaket.get(e.paketId) ?? []), e]);
      for (const [paket, es] of jePaket) {
        if (this.zustellend.has(paket)) continue;
        this.zustellend.add(paket);
        void this.stellePaketZu(paket, es)
          .catch((e) => log.error('Paket-Läufer: Zustellung unterbrochen', { paket, fehler: (e as Error).message }))
          .finally(() => { this.zustellend.delete(paket); if (this.laeuft()) setImmediate(() => void this.stelleZu()); });
      }
    } catch (e) {
      log.error('Paket-Läufer: Zustellung unterbrochen', { fehler: (e as Error).message });
    } finally { this.holend = false; }
  }

  /** Ereignisse eines Pakets der Reihe nach; beim ersten Fehler Schluss (Wiederholung später). */
  private async stellePaketZu(paket: string, es: PaketEreignis[]): Promise<void> {
    for (const e of es) {
      if (!this.laeuft()) return; // Wartung oder Läufer weg: später, ohne Versuch
      if (!this.pakete.some((p) => p.id === paket)) { await this.o.dienst.kern.repo.ereignisFehlgeschlagen(e.id, t('meldungen.verwaltung.das-paket-hat-keinen'), null); continue; }
      // Antwort jedes Aufrufs (#636): z. B. Stand der Kopie außer Haus – das Paket meldet ihn, statt selbst zu schreiben.
      const antwort = (r: Ergebnis, beginn: number) => r.ohneVersuch ? Promise.resolve() :
        this.o.dienst.nachEreignisAufruf(paket, e, { ok: r.ok, text: r.text, fehler: r.fehler, rc: r.rc, beginn }).catch((f) => log.warn('Paket-Läufer: Antwort des Pakets nicht übernommen', { paket, art: e.art, fehler: (f as Error).message }));
      let beginn = Date.now();
      let r = await this.rufe(paket, 'ereignis', { art: e.art, id: e.id, erstellt: e.erstellt, versuch: e.versuche + 1, daten: e.daten });
      await antwort(r, beginn);
      // Fortsetzung (#458): gleich noch einmal, mit dem Stand des Pakets; der Stand bleibt für eine Wiederholung gespeichert.
      for (let weiter = r.ok ? liesWeiter(r.text) : null; weiter; weiter = r.ok ? liesWeiter(r.text) : null) {
        const abschnitt = (Number(e.daten.abschnitt) || 0) + 1;
        const max = this.o.weiterMax ?? WEITER_MAX;
        if (abschnitt > max) { this.notiere(paket, { stufe: 2, text: t('meldungen.verwaltung.ereignis-nach-fortsetzungen-beendet', { max }) }); break; }
        e.daten = { ...e.daten, weiter, abschnitt };
        await this.o.dienst.kern.repo.ereignisDaten(e.id, e.daten);
        await this.o.dienst.texterkennungFortschritt(paket, e, weiter).catch(() => {});
        if (!this.laeuft()) return;
        beginn = Date.now();
        r = await this.rufe(paket, 'ereignis', { art: e.art, id: e.id, erstellt: e.erstellt, versuch: e.versuche + 1, daten: e.daten });
        await antwort(r, beginn);
      }
      // Texterkennung als Paket (#458): Dokument wartet nicht länger, wenn das Paket fertig ist oder aufgibt.
      const nachher = (x: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) =>
        this.o.dienst.nachTexterkennungsEreignis(paket, e, x).catch((f) => log.warn('Paket-Läufer: Stand der Texterkennung nicht nachgetragen', { paket, fehler: (f as Error).message }));
      if (r.ok) { await this.o.dienst.kern.repo.ereignisZugestellt(e.id); await nachher({ ok: true, text: r.text }); continue; }
      if (r.ohneVersuch) return;
      const w = WARTEN_MIN[e.versuche];
      await this.o.dienst.kern.repo.ereignisFehlgeschlagen(e.id, r.fehler ?? 'Fehler', w === undefined ? null : new Date(Date.now() + w * 60_000));
      if (w === undefined) { log.error(`Paket ${paket}: Ereignis aufgegeben`, { paket, art: e.art, fehler: r.fehler }); await nachher({ ok: false, text: '', fehler: r.fehler, aufgegeben: true }); continue; }
      return; // spätere Ereignisse dieses Pakets warten auf die Wiederholung (Reihenfolge)
    }
  }

  /** Für die Werkbank: Stand je Paket mit Code. */
  async uebersicht(): Promise<{ laeuft: boolean; pausiert: boolean; zustand: LaeuferZustand; absturz: string | null; grenzen: Grenzen; pakete: PaketStand[] }> {
    const ereignisse = await this.o.dienst.kern.repo.ereignisStand();
    const laeuft = !!this.kind && this.bereit;
    const zustand: LaeuferZustand = this.o.pausiert?.() ? 'pausiert' : laeuft ? 'bereit' : !this.pakete.length ? 'aus' : !this.kind && this.absturz ? 'neustart' : 'startet';
    return {
      laeuft, pausiert: !!this.o.pausiert?.(), zustand, absturz: this.absturz, grenzen: this.grenzen,
      pakete: this.pakete.map((p) => {
        const s = this.standVon(p.id);
        return {
          id: p.id, name: p.name, version: p.version, dienstkonto: this.konto.get(p.id)?.name ?? null,
          geladen: this.ladefehler.has(p.id) && !this.ladefehler.get(p.id), fehler: this.ladefehler.get(p.id) ?? null,
          ...s, letzte: [...s.letzte].reverse(), protokoll: [...s.protokoll].reverse(),
          ereignisse: ereignisse[p.id] ?? { offen: 0, aufgegeben: 0, zugestellt: 0 },
        };
      }),
    };
  }
}


