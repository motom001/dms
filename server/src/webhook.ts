import { darfBereich } from '../../shared/src/verwaltungsrecht';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type postgres from 'postgres';
import type { Benutzer } from '../../shared/src/model';
import { uebersetzer } from '../../shared/src/sprache';
import webhookTexte from '../../shared/src/sprachen/de/webhook.json';
import {
  ursprung, WEBHOOK_ABSTAND_S, WEBHOOK_ANSTOSS_S, WEBHOOK_EREIGNISSE, WEBHOOK_KOPF, WEBHOOK_MAX_JE_BENUTZER,
  WEBHOOK_WARTEN_S, WEBHOOK_ZEITGRENZE_S, zielProblem,
  type WebhookAbgeschaltet, type WebhookAnsicht, type WebhookEreignis, type WebhookErgebnis, type WebhookRumpf, type WebhookVerlauf,
  type WebhookWerkbank, type WebhookZahlen,
} from '../../shared/src/webhook';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { istUuid } from './repo';

/**
 * Webhooks (#627): Das DMS meldet sich selbst, sobald sich die Zahlen eines Benutzers ändern (neue Post,
 * Zu erledigen, überfällige Fristen – dieselben wie `GET /api/v1/ich/zaehler`, #625).
 *
 * - **Ohne Inhalte:** Der Rumpf enthält Art, Ereignis-Id, Zeit und die Zahlen. Keine Titel, Namen, Absender.
 * - **Signiert:** HMAC-SHA256 über `<zeit>.<rumpf>` mit einem Geheimnis je Webhook (verschlüsselt gespeichert,
 *   beim Anlegen einmal angezeigt). Köpfe `x-dms-signatur: v1=<hex>`, `x-dms-zeit`, `x-dms-ereignis`, `x-dms-art`.
 * - **Nur freigegebene Ziele:** `https://`, im Heimnetz auch `http://` (heimnetz.ts). Benutzer nutzen nur Ziele
 *   (Ursprung), die ein Administrator freigegeben hat; trägt ein Administrator selbst eine Adresse ein, gilt ihr
 *   Ursprung als freigegeben. Weiterleitungen folgt das DMS nicht.
 * - **Mindestens einmal:** Ausgangskorb in der Datenbank (`webhook_meldungen`), höchstens eine offene Meldung je
 *   Webhook. Neuere Zahlen ersetzen die Daten der offenen Meldung (Zusammenfassen); war sie schon einmal versucht,
 *   bekommt sie dabei eine neue Ereignis-Id. Mindestabstand {@link WEBHOOK_ABSTAND_S} s je Webhook; Wiederholung
 *   mit wachsenden Abständen ({@link WEBHOOK_WARTEN_S}), nach dem letzten Versuch aufgegeben und abgeschaltet.
 * - **Mehrere Server:** Was gemeldet ist (`gemeldet_stand`), was offen ist und wann zuletzt gesendet wurde, steht in
 *   der Datenbank. Eine Meldung holt sich ein Server mit `FOR UPDATE SKIP LOCKED` und einer Frist (Lease); stirbt er
 *   beim Senden, holt sie nach der Frist ein anderer (dann kommt sie unter Umständen doppelt – die Ereignis-Id
 *   erkennt das). Die regelmäßigen Läufe (Zählen jede Minute, Zustellen alle 5 s, Aufräumen) laufen nur auf dem
 *   Server mit der Datenbanksperre; nach einer Änderung zählt und stellt der Server zu, auf dem sie passiert ist.
 */

const log = protokoll.modul('webhook');
const t = uebersetzer({ webhook: webhookTexte });

/** Frist, in der ein Server eine geholte Meldung zustellen muss, sonst holt sie ein anderer. */
const LEASE_S = 60;
/** Zählen ohne Anlass (Mitternacht, Fristen, Änderungen auf einem anderen Server). */
const PRUEF_MS = 60_000;
/** Fällige Meldungen zustellen (auch die zusammengefassten, deren Mindestabstand abgelaufen ist). */
const ZUSTELL_MS = 5_000;
/** Erledigte Meldungen bleiben so lange im Verlauf. */
const VERLAUF_TAGE = 7;
/** Einstellung mit den freigegebenen Zielen (Ursprünge). */
export const ZIELE_SCHLUESSEL = 'webhook_ziele';
/** Präfix des Geheimnisses (erkennbar beim Kopieren und in Geheimnis-Scannern). */
export const GEHEIMNIS_PRAEFIX = 'whsec_';

/* ---------- Signatur ---------- */

/** Signatur einer Meldung: `v1=` und HMAC-SHA256 (hex) über `<zeit>.<rumpf>` mit dem Geheimnis (UTF-8). */
export function signatur(geheimnis: string, zeit: number | string, rumpf: string): string {
  return `v1=${createHmac('sha256', geheimnis).update(`${zeit}.${rumpf}`).digest('hex')}`;
}

/**
 * Prüfung wie beim Empfänger (für Tests und als Vorlage im Handbuch): Signatur passt und der Zeitstempel liegt
 * höchstens `toleranzS` Sekunden zurück oder voraus.
 */
export function pruefeSignatur(geheimnis: string, kopf: { signatur?: string; zeit?: string }, rumpf: string, jetztS = Math.floor(Date.now() / 1000), toleranzS = 300): boolean {
  const zeit = Number(kopf.zeit);
  if (!kopf.signatur || !Number.isInteger(zeit) || Math.abs(jetztS - zeit) > toleranzS) return false;
  const soll = Buffer.from(signatur(geheimnis, zeit, rumpf));
  return kopf.signatur.split(',').map((s) => Buffer.from(s.trim())).some((ist) => ist.length === soll.length && timingSafeEqual(ist, soll));
}

/* ---------- Speicher ---------- */

export interface WebhookDaten {
  id: string; benutzerId: string; name: string; url: string;
  /** Verschlüsselt („dms1$…“). */
  geheimnis: string;
  ereignisse: string[]; aktiv: boolean; abgeschaltet: WebhookAbgeschaltet | null;
  gemeldetStand: number | null; fehlerFolge: number; letzte: WebhookErgebnis | null; erstellt: string;
  offen: { faellig: string; versuche: number } | null;
}
/** Eine geholte Meldung zum Zustellen. */
export interface Meldung { id: string; webhookId: string; ereignisId: string; art: WebhookEreignis; daten: WebhookZahlen; erstellt: string; versuch: number; url: string; geheimnis: string; name: string; benutzerId: string }

export interface WebhookRepo {
  /** Alle Webhooks, oder die eines Benutzers. */
  liste(benutzerId?: string): Promise<WebhookDaten[]>;
  hole(id: string): Promise<WebhookDaten | undefined>;
  lege(w: Pick<WebhookDaten, 'id' | 'benutzerId' | 'name' | 'url' | 'geheimnis' | 'ereignisse'>): Promise<void>;
  /**
   * Felder ändern. Wird ein Webhook (wieder) eingeschaltet, beginnt er von vorn: kein gemeldeter Stand (die erste
   * Prüfung meldet die aktuellen Zahlen), keine Fehlerfolge. Ausschalten verwirft eine offene Meldung.
   */
  aendere(id: string, d: Partial<Pick<WebhookDaten, 'name' | 'url' | 'geheimnis' | 'aktiv' | 'abgeschaltet'>>): Promise<void>;
  loesche(id: string): Promise<void>;
  /**
   * Stand merken und Meldung in den Ausgangskorb – in einem Schritt (Zeilensperre auf dem Webhook):
   * Ist `stand` nicht größer als der gemeldete, passiert nichts (`null`). Sonst ersetzen die Daten die einer
   * offenen Meldung (`zusammengefasst`; schon versucht → neue Ereignis-Id), oder es entsteht eine neue (`neu`),
   * fällig frühestens `abstandS` Sekunden nach dem letzten Senden.
   */
  merkeStand(id: string, stand: number, daten: WebhookZahlen, abstandS: number): Promise<'neu' | 'zusammengefasst' | null>;
  /** Fällige Meldungen holen: Versuch zählt hoch, fällig erst wieder nach `leaseS` (falls der Server stirbt). */
  faellige(anzahl: number, leaseS: number): Promise<Meldung[]>;
  /**
   * Zugestellt. Hat sich die Meldung inzwischen geändert (andere Ereignis-Id), bleibt sie offen und geht nach dem
   * Mindestabstand mit den neuen Daten noch einmal (`false`).
   */
  zugestellt(m: Meldung, e: WebhookErgebnis, abstandS: number): Promise<boolean>;
  /** Fehlgeschlagen: `naechsterS` = Wartezeit bis zum nächsten Versuch, `null` = aufgeben und Webhook abschalten. */
  fehlgeschlagen(m: Meldung, e: WebhookErgebnis, naechsterS: number | null, abgeschaltet: WebhookAbgeschaltet | null): Promise<void>;
  /** Ergebnis einer Probe merken. */
  probe(id: string, e: WebhookErgebnis): Promise<void>;
  verlauf(id: string, anzahl: number): Promise<WebhookVerlauf[]>;
  raeumeAuf(tage: number): Promise<number>;
}

/* ---------- Dienst ---------- */

/** Das Nötigste von fetch, damit Tests einen Empfänger nachstellen können. */
export type Abruf = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) =>
  Promise<{ status: number; body?: { cancel(): Promise<void> } | null }>;

export interface WebhookDeps {
  repo: WebhookRepo;
  einstellungen: Einstellungen;
  verschluessele: (klartext: string) => string;
  entschluessele: (wert: string) => string | null;
  /** Zahlen eines Benutzers, in seinen Rechten (Zähler-Endpunkt #625). */
  zahlen: (b: Benutzer) => Promise<WebhookZahlen>;
  benutzer: (id: string) => Promise<Benutzer | undefined>;
  abruf?: Abruf;
  /** Grund für eine Pause (Wartungsmodus, Wiederherstellung) oder null. */
  pause?: () => string | null;
  /** Nur ein Server macht die regelmäßigen Läufe (pg_try_advisory_lock). Ohne: immer. */
  sperre?: () => Promise<boolean>;
  /** Hinweis an die Administratoren, wenn ein Webhook nach vielen Fehlschlägen abgeschaltet wurde. */
  anAdmins?: (betreff: import('./mail').MailText, text: import('./mail').MailText) => Promise<void>;
  /** Mail an den Besitzer eines abgeschalteten Webhooks (Frage 67) – Administratoren bekommen schon die Mail an alle Admins. */
  anBesitzer?: (b: Benutzer, betreff: import('./mail').MailText, text: import('./mail').MailText) => Promise<void>;
  /** Für Tests: kürzere Zeiten (Sekunden). */
  zeiten?: { abstandS?: number; anstossS?: number; wartenS?: readonly number[] };
}

const jetzt = () => new Date().toISOString();
const ansicht = (w: WebhookDaten): WebhookAnsicht => ({
  id: w.id, name: w.name, url: w.url, ereignisse: w.ereignisse, aktiv: w.aktiv, abgeschaltet: w.abgeschaltet,
  fehlerFolge: w.fehlerFolge, letzte: w.letzte, offen: w.offen, erstellt: w.erstellt,
});

export class Webhooks {
  private anstoss: NodeJS.Timeout | null = null;
  private pruefend: Promise<void> | null = null;
  private nochmal = false;
  private sendend = false;
  private zeitgeber: NodeJS.Timeout[] = [];
  private geplant: NodeJS.Timeout | null = null;
  constructor(private d: WebhookDeps) {}

  private get abstandS() { return this.d.zeiten?.abstandS ?? WEBHOOK_ABSTAND_S; }
  private get wartenS() { return this.d.zeiten?.wartenS ?? WEBHOOK_WARTEN_S; }

  /* --- Ziele --- */

  /** Freigegebene Ziele (Ursprünge wie `https://homey.home.arpa`). */
  async ziele(): Promise<string[]> {
    const w = await this.d.einstellungen.lies(ZIELE_SCHLUESSEL);
    return Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string') : [];
  }

  /** Ziele setzen (Werkbank): jede Zeile eine Adresse; gespeichert wird ihr Ursprung. */
  async setzeZiele(x: unknown, von: string): Promise<string[]> {
    const roh = Array.isArray(x) ? x : [];
    const liste: string[] = [];
    for (const r of roh) {
      const s = String(r ?? '').trim();
      if (!s) continue;
      const p = zielProblem(s);
      if (p) throw new Fachfehler(422, `${s}: ${p}`);
      const o = ursprung(s)!;
      if (!liste.includes(o)) liste.push(o);
    }
    if (liste.length > 50) throw new Fachfehler(422, t('webhook.ziele.zuviele'));
    await this.d.einstellungen.schreibe(ZIELE_SCHLUESSEL, liste);
    log.info('Freigegebene Ziele für Webhooks geändert', { von, ziele: liste });
    return liste;
  }

  private async pruefeZiel(url: unknown, ich: Benutzer): Promise<string> {
    const s = String(url ?? '').trim();
    const p = zielProblem(s);
    if (p) throw new Fachfehler(422, p);
    const o = ursprung(s)!;
    const ziele = await this.ziele();
    if (!ziele.includes(o)) {
      if (ich.rolle !== 'admin') throw new Fachfehler(422, t('webhook.ziel.nicht-freigegeben', { ursprung: o }));
      // Ein Administrator trägt die Adresse selbst ein: damit ist ihr Ursprung freigegeben.
      await this.d.einstellungen.schreibe(ZIELE_SCHLUESSEL, [...ziele, o]);
      log.info('Ziel für Webhooks freigegeben', { von: ich.email, ziel: o });
    }
    return s;
  }

  /* --- eigene Webhooks (Profil) --- */

  async liste(ich: Benutzer): Promise<WebhookAnsicht[]> { return (await this.d.repo.liste(ich.id)).map(ansicht); }

  private async eigener(ich: Benutzer, id: string): Promise<WebhookDaten> {
    const w = istUuid(id) ? await this.d.repo.hole(id) : undefined;
    if (!w || w.benutzerId !== ich.id) throw new Fachfehler(404, t('webhook.nicht-gefunden'));
    return w;
  }

  private neuesGeheimnis(): { klar: string; gespeichert: string } {
    const klar = `${GEHEIMNIS_PRAEFIX}${randomBytes(32).toString('base64url')}`;
    let gespeichert: string;
    try { gespeichert = this.d.verschluessele(klar); } catch { throw new Fachfehler(409, t('webhook.tresor.fehlt')); }
    return { klar, gespeichert };
  }

  /** Anlegen; das Geheimnis kommt nur dieses eine Mal zurück. Die erste Prüfung meldet gleich die aktuellen Zahlen. */
  async lege(ich: Benutzer, x: unknown): Promise<WebhookAnsicht & { geheimnis: string }> {
    const e = (x ?? {}) as Record<string, unknown>;
    const name = String(e.name ?? '').trim().slice(0, 80);
    if (!name) throw new Fachfehler(422, t('webhook.name.leer'));
    if ((await this.d.repo.liste(ich.id)).length >= WEBHOOK_MAX_JE_BENUTZER) throw new Fachfehler(409, t('webhook.max', { anzahl: WEBHOOK_MAX_JE_BENUTZER }));
    const url = await this.pruefeZiel(e.url, ich);
    const g = this.neuesGeheimnis();
    const id = randomUUID();
    await this.d.repo.lege({ id, benutzerId: ich.id, name, url, geheimnis: g.gespeichert, ereignisse: [...WEBHOOK_EREIGNISSE] });
    log.info('Webhook angelegt', { id, von: ich.email, ziel: ursprung(url) });
    this.anstossen();
    return { ...ansicht((await this.d.repo.hole(id))!), geheimnis: g.klar };
  }

  /** Name, Adresse, an/aus. Hat ein Administrator abgeschaltet, schaltet nur ein Administrator wieder ein. */
  async aendere(ich: Benutzer, id: string, x: unknown): Promise<WebhookAnsicht> {
    const w = await this.eigener(ich, id);
    const e = (x ?? {}) as Record<string, unknown>;
    const d: Parameters<WebhookRepo['aendere']>[1] = {};
    if (e.name !== undefined) { d.name = String(e.name).trim().slice(0, 80); if (!d.name) throw new Fachfehler(422, t('webhook.name.leer')); }
    if (e.url !== undefined && String(e.url).trim() !== w.url) d.url = await this.pruefeZiel(e.url, ich);
    if (typeof e.aktiv === 'boolean' && e.aktiv !== w.aktiv) {
      if (e.aktiv && w.abgeschaltet?.grund === 'admin' && ich.rolle !== 'admin') throw new Fachfehler(403, t('webhook.admin-abgeschaltet'));
      d.aktiv = e.aktiv;
      d.abgeschaltet = null;
    }
    await this.d.repo.aendere(id, d);
    if (d.aktiv || d.url) this.anstossen();
    return ansicht((await this.d.repo.hole(id))!);
  }

  async loesche(ich: Benutzer, id: string): Promise<void> {
    await this.eigener(ich, id);
    await this.d.repo.loesche(id);
    log.info('Webhook gelöscht', { id, von: ich.email });
  }

  /** Neues Geheimnis (das alte gilt sofort nicht mehr); nur dieses eine Mal sichtbar. */
  async erneuereGeheimnis(ich: Benutzer, id: string): Promise<{ geheimnis: string }> {
    await this.eigener(ich, id);
    const g = this.neuesGeheimnis();
    await this.d.repo.aendere(id, { geheimnis: g.gespeichert });
    log.info('Geheimnis eines Webhooks erneuert', { id, von: ich.email });
    return { geheimnis: g.klar };
  }

  async verlauf(ich: Benutzer, id: string): Promise<WebhookVerlauf[]> {
    await this.eigener(ich, id);
    return this.d.repo.verlauf(id, 20);
  }

  /** „Probe senden“: sofort, mit den aktuellen Zahlen und Art `probe`; ohne Ausgangskorb und ohne Wiederholung. */
  async probe(ich: Benutzer, id: string): Promise<WebhookErgebnis> {
    const w = await this.eigener(ich, id);
    const zahlen = await this.d.zahlen(ich);
    const geheimnis = this.d.entschluessele(w.geheimnis);
    let e: WebhookErgebnis;
    if (geheimnis === null) e = { zeit: jetzt(), art: 'probe', ok: false, status: null, fehler: t('webhook.geheimnis.unlesbar'), ms: 0 };
    else if (!(await this.ziele()).includes(ursprung(w.url) ?? '')) e = { zeit: jetzt(), art: 'probe', ok: false, status: null, fehler: t('webhook.fehler.ziel-entzogen'), ms: 0 };
    else e = await this.sende(w.id, w.url, geheimnis, { art: 'probe', id: randomUUID(), zeit: jetzt(), daten: zahlen }, 1);
    await this.d.repo.probe(id, e);
    log.info('Webhook: Probe gesendet', { id, ok: e.ok, status: e.status, fehler: e.fehler });
    return e;
  }

  /* --- Werkbank --- */

  async uebersicht(): Promise<{ webhooks: WebhookWerkbank[]; ziele: string[] }> {
    const liste = await this.d.repo.liste();
    const namen = new Map<string, string>();
    for (const id of new Set(liste.map((w) => w.benutzerId))) { const b = await this.d.benutzer(id); namen.set(id, b ? b.name || b.email : '–'); }
    return { webhooks: liste.map((w) => ({ ...ansicht(w), benutzer: { id: w.benutzerId, name: namen.get(w.benutzerId) ?? '–' } })), ziele: await this.ziele() };
  }

  /** Administrator schaltet ab oder wieder ein. */
  async schalteWerkbank(id: string, aktiv: boolean, von: string): Promise<void> {
    const w = istUuid(id) ? await this.d.repo.hole(id) : undefined;
    if (!w) throw new Fachfehler(404, t('webhook.nicht-gefunden'));
    await this.d.repo.aendere(id, aktiv ? { aktiv: true, abgeschaltet: null } : { aktiv: false, abgeschaltet: { grund: 'admin', zeit: jetzt(), von } });
    log.info(aktiv ? 'Webhook in der Werkbank eingeschaltet' : 'Webhook in der Werkbank abgeschaltet', { id, von });
    if (aktiv) this.anstossen();
  }

  async loescheWerkbank(id: string, von: string): Promise<void> {
    const w = istUuid(id) ? await this.d.repo.hole(id) : undefined;
    if (!w) throw new Fachfehler(404, t('webhook.nicht-gefunden'));
    await this.d.repo.loesche(id);
    log.info('Webhook in der Werkbank gelöscht', { id, von });
  }

  /* --- Ablauf --- */

  /** Nach einer Änderung im DMS: kurz warten (weitere Änderungen zählen mit), dann zählen und zustellen. */
  anstossen() {
    if (this.anstoss) return;
    this.anstoss = setTimeout(() => {
      this.anstoss = null;
      void this.pruefe().then(() => this.stelleZu()).catch((e) => log.error('Webhooks: Prüfen fehlgeschlagen', { fehler: (e as Error).message }));
    }, (this.d.zeiten?.anstossS ?? WEBHOOK_ANSTOSS_S) * 1000);
    this.anstoss.unref?.();
  }

  /**
   * Zahlen aller Benutzer mit eingeschalteten Webhooks zählen und Geändertes in den Ausgangskorb legen.
   * Läuft schon eine Prüfung, folgt genau eine weitere danach (damit keine Änderung verloren geht).
   */
  async pruefe(): Promise<void> {
    if (this.pruefend) { this.nochmal = true; return this.pruefend; }
    this.pruefend = (async () => {
      do {
        this.nochmal = false;
        if (this.d.pause?.()) return;
        const aktive = (await this.d.repo.liste()).filter((w) => w.aktiv && w.ereignisse.includes('zaehler.geaendert'));
        const jeBenutzer = new Map<string, WebhookDaten[]>();
        for (const w of aktive) jeBenutzer.set(w.benutzerId, [...(jeBenutzer.get(w.benutzerId) ?? []), w]);
        for (const [id, hooks] of jeBenutzer) {
          try {
            const b = await this.d.benutzer(id);
            if (!b || b.aktiv === false) continue;
            const z = await this.d.zahlen(b);
            for (const w of hooks) {
              if (w.gemeldetStand !== null && w.gemeldetStand >= z.stand) continue;
              // Zusammengefasst oder wegen des Mindestabstands später fällig: dann hier zustellen, nicht erst beim nächsten Lauf.
              if (await this.d.repo.merkeStand(w.id, z.stand, z, this.abstandS)) this.planeZustellung();
            }
          } catch (e) { log.warn('Webhooks: Zahlen eines Benutzers nicht gezählt', { benutzer: id, fehler: (e as Error).message }); }
        }
      } while (this.nochmal);
    })().finally(() => { this.pruefend = null; });
    return this.pruefend;
  }

  /** Fällige Meldungen zustellen, bis keine mehr fällig ist. */
  async stelleZu(): Promise<void> {
    if (this.sendend || this.d.pause?.()) return;
    this.sendend = true;
    try {
      for (let runde = 0; runde < 20; runde++) {
        const liste = await this.d.repo.faellige(10, LEASE_S);
        if (!liste.length) return;
        await Promise.all(liste.map((m) => this.stelle(m)));
      }
    } finally { this.sendend = false; }
  }

  private async stelle(m: Meldung): Promise<void> {
    const geheimnis = this.d.entschluessele(m.geheimnis);
    const erlaubt = (await this.ziele()).includes(ursprung(m.url) ?? '');
    const e = geheimnis === null ? { zeit: jetzt(), art: m.art, ok: false, status: null, fehler: t('webhook.geheimnis.unlesbar'), ms: 0 }
      : !erlaubt ? { zeit: jetzt(), art: m.art, ok: false, status: null, fehler: t('webhook.fehler.ziel-entzogen'), ms: 0 }
      : await this.sende(m.webhookId, m.url, geheimnis, { art: m.art, id: m.ereignisId, zeit: m.erstellt, daten: m.daten }, m.versuch);
    if (e.ok) { if (!(await this.d.repo.zugestellt(m, e, this.abstandS))) this.planeZustellung(); return; }
    const warten = this.wartenS[m.versuch - 1];
    if (warten !== undefined) { await this.d.repo.fehlgeschlagen(m, e, warten, null); return; }
    // Aufgeben: Webhook abschalten, mit Hinweis (Profil, Werkbank, Protokoll, Mail an alle, die Webhooks verwalten).
    const ab: WebhookAbgeschaltet = { grund: 'fehler', zeit: jetzt(), text: e.fehler ?? '' };
    await this.d.repo.fehlgeschlagen(m, e, null, ab);
    log.warn('Webhook nach vielen Fehlschlägen abgeschaltet', { id: m.webhookId, versuche: m.versuch, fehler: e.fehler });
    const b = await this.d.benutzer(m.benutzerId).catch(() => undefined);
    await this.d.anAdmins?.(() => t('webhook.abgeschaltet.betreff', { name: m.name }),
      () => t('webhook.abgeschaltet.text', { name: m.name, benutzer: b ? b.name || b.email : '–', versuche: m.versuch, fehler: e.fehler ?? '' }))
      .catch((f) => log.warn('Webhooks: Hinweis an die Administratoren nicht gesendet', { fehler: (f as Error).message }));
    // Wer Webhooks verwaltet, hat die Mail an die Verwaltenden schon bekommen (#818).
    if (b && b.aktiv && !darfBereich(b, 'webhooks')) {
      await this.d.anBesitzer?.(b, () => t('webhook.abgeschaltet.betreff', { name: m.name }),
        () => t('webhook.abgeschaltet.besitzer', { name: b.name || b.email, webhook: m.name, versuche: m.versuch, fehler: e.fehler ?? '' }))
        .catch((f) => log.warn('Webhooks: Hinweis an den Besitzer nicht gesendet', { fehler: (f as Error).message }));
    }
  }

  /** Nach dem Mindestabstand (noch einmal) zustellen; ein Zeitgeber genügt. */
  private planeZustellung() {
    if (this.geplant) return;
    this.geplant = setTimeout(() => {
      this.geplant = null;
      void this.stelleZu().catch((e) => log.error('Webhooks: Zustellen fehlgeschlagen', { fehler: (e as Error).message }));
    }, this.abstandS * 1000 + 100);
    this.geplant.unref?.();
  }

  /** Eine Meldung senden: signiert, Zeitgrenze, keine Weiterleitungen. */
  private async sende(webhookId: string, url: string, geheimnis: string, rumpf: WebhookRumpf, versuch: number): Promise<WebhookErgebnis> {
    const text = JSON.stringify(rumpf);
    const zeit = Math.floor(Date.now() / 1000);
    const kopf: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'DMS-Webhook',
      [WEBHOOK_KOPF.art]: rumpf.art,
      [WEBHOOK_KOPF.ereignis]: rumpf.id,
      [WEBHOOK_KOPF.zeit]: String(zeit),
      [WEBHOOK_KOPF.signatur]: signatur(geheimnis, zeit, text),
      [WEBHOOK_KOPF.versuch]: String(versuch),
      [WEBHOOK_KOPF.webhook]: webhookId,
    };
    const start = performance.now();
    const ergebnis = (ok: boolean, status: number | null, fehler: string | null): WebhookErgebnis =>
      ({ zeit: new Date().toISOString(), art: rumpf.art, ok, status, fehler, ms: Math.round(performance.now() - start) });
    try {
      const abruf = this.d.abruf ?? (fetch as unknown as Abruf);
      const r = await abruf(url, { method: 'POST', headers: kopf, body: text, redirect: 'manual', signal: AbortSignal.timeout(WEBHOOK_ZEITGRENZE_S * 1000) });
      await r.body?.cancel().catch(() => {});
      if (r.status >= 200 && r.status < 300) return ergebnis(true, r.status, null);
      if (r.status >= 300 && r.status < 400) return ergebnis(false, r.status, t('webhook.fehler.weiterleitung', { status: r.status }));
      return ergebnis(false, r.status, t('webhook.fehler.status', { status: r.status }));
    } catch (e) {
      const f = e as Error & { cause?: { code?: string; message?: string } };
      if (f.name === 'TimeoutError' || f.name === 'AbortError') return ergebnis(false, null, t('webhook.fehler.zeit', { s: WEBHOOK_ZEITGRENZE_S }));
      return ergebnis(false, null, t('webhook.fehler.verbindung', { text: f.cause?.code ?? f.cause?.message ?? f.message }));
    }
  }

  /** Regelmäßige Läufe (nur mit der Datenbanksperre): zählen jede Minute, zustellen alle 5 s, aufräumen stündlich. */
  start() {
    let letztesAufraeumen = 0;
    const mitSperre = (f: () => Promise<unknown>) => async () => {
      if (this.d.pause?.()) return;
      if (this.d.sperre && !(await this.d.sperre().catch(() => false))) return;
      await f();
    };
    const pruefLauf = mitSperre(async () => {
      await this.pruefe();
      if (Date.now() - letztesAufraeumen > 3_600_000) { letztesAufraeumen = Date.now(); await this.d.repo.raeumeAuf(VERLAUF_TAGE); }
    });
    const zustellLauf = mitSperre(() => this.stelleZu());
    const fang = (was: string) => (e: unknown) => log.error(`Webhooks: ${was} fehlgeschlagen`, { fehler: (e as Error).message });
    this.zeitgeber.push(setInterval(() => void pruefLauf().catch(fang('Prüfen')), PRUEF_MS));
    this.zeitgeber.push(setInterval(() => void zustellLauf().catch(fang('Zustellen')), ZUSTELL_MS));
    for (const z of this.zeitgeber) z.unref?.();
    void pruefLauf().then(zustellLauf).catch(fang('Prüfen'));
  }

  stop() {
    for (const z of this.zeitgeber) clearInterval(z);
    this.zeitgeber = [];
    if (this.anstoss) { clearTimeout(this.anstoss); this.anstoss = null; }
    if (this.geplant) { clearTimeout(this.geplant); this.geplant = null; }
  }
}

/* ---------- Arbeitsspeicher (Tests) ---------- */

interface Zeile { id: string; webhookId: string; ereignisId: string; art: WebhookEreignis; daten: WebhookZahlen; zustand: WebhookVerlauf['zustand']; erstellt: string; faellig: number; versuche: number; status: number | null; fehler: string | null; erledigt: string | null }

export function speicherWebhookRepo(uhr: () => number = Date.now): WebhookRepo {
  const hooks = new Map<string, WebhookDaten & { gesendet: number | null }>();
  const zeilen: Zeile[] = [];
  const offen = (id: string) => zeilen.find((z) => z.webhookId === id && z.zustand === 'offen');
  const mitOffen = (w: WebhookDaten & { gesendet: number | null }): WebhookDaten => {
    const o = offen(w.id);
    const { gesendet: _g, ...rest } = w;
    return structuredClone({ ...rest, offen: o ? { faellig: new Date(o.faellig).toISOString(), versuche: o.versuche } : null });
  };
  const verwirf = (id: string) => { for (const z of zeilen) if (z.webhookId === id && z.zustand === 'offen') { z.zustand = 'verworfen'; z.erledigt = new Date(uhr()).toISOString(); } };
  return {
    async liste(b) { return [...hooks.values()].filter((w) => !b || w.benutzerId === b).sort((a, c) => a.erstellt.localeCompare(c.erstellt)).map(mitOffen); },
    async hole(id) { const w = hooks.get(id); return w && mitOffen(w); },
    async lege(w) { hooks.set(w.id, { ...w, aktiv: true, abgeschaltet: null, gemeldetStand: null, fehlerFolge: 0, letzte: null, erstellt: new Date(uhr()).toISOString(), offen: null, gesendet: null }); },
    async aendere(id, d) {
      const w = hooks.get(id);
      if (!w) return;
      Object.assign(w, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
      if (d.aktiv === true) { w.gemeldetStand = null; w.fehlerFolge = 0; }
      if (d.aktiv === false || d.url !== undefined) verwirf(id);
      if (d.url !== undefined) w.gemeldetStand = null;
    },
    async loesche(id) { hooks.delete(id); for (let i = zeilen.length - 1; i >= 0; i--) if (zeilen[i].webhookId === id) zeilen.splice(i, 1); },
    async merkeStand(id, stand, daten, abstandS) {
      const w = hooks.get(id);
      if (!w || !w.aktiv || (w.gemeldetStand !== null && w.gemeldetStand >= stand)) return null;
      w.gemeldetStand = stand;
      const o = offen(id);
      if (o) { o.daten = structuredClone(daten); if (o.versuche > 0) o.ereignisId = randomUUID(); return 'zusammengefasst'; }
      zeilen.push({ id: randomUUID(), webhookId: id, ereignisId: randomUUID(), art: 'zaehler.geaendert', daten: structuredClone(daten), zustand: 'offen', erstellt: new Date(uhr()).toISOString(),
        faellig: Math.max(uhr(), (w.gesendet ?? 0) + abstandS * 1000), versuche: 0, status: null, fehler: null, erledigt: null });
      return 'neu';
    },
    async faellige(anzahl, leaseS) {
      const erg: Meldung[] = [];
      for (const z of zeilen.filter((x) => x.zustand === 'offen' && x.faellig <= uhr()).sort((a, b) => a.faellig - b.faellig).slice(0, anzahl)) {
        const w = hooks.get(z.webhookId);
        if (!w?.aktiv) continue;
        z.versuche++; z.faellig = uhr() + leaseS * 1000; w.gesendet = uhr();
        erg.push({ id: z.id, webhookId: w.id, ereignisId: z.ereignisId, art: z.art, daten: structuredClone(z.daten), erstellt: z.erstellt, versuch: z.versuche, url: w.url, geheimnis: w.geheimnis, name: w.name, benutzerId: w.benutzerId });
      }
      return erg;
    },
    async zugestellt(m, e, abstandS) {
      const w = hooks.get(m.webhookId);
      if (w) { w.fehlerFolge = 0; w.letzte = e; }
      const z = zeilen.find((x) => x.id === m.id);
      if (!z) return true;
      if (z.ereignisId !== m.ereignisId && z.zustand === 'offen') { z.versuche = 0; z.fehler = null; z.faellig = uhr() + abstandS * 1000; return false; }
      Object.assign(z, { zustand: 'zugestellt', status: e.status, fehler: null, erledigt: e.zeit });
      return true;
    },
    async fehlgeschlagen(m, e, naechsterS, ab) {
      const w = hooks.get(m.webhookId);
      if (w) { w.fehlerFolge++; w.letzte = e; if (ab) { w.aktiv = false; w.abgeschaltet = ab; } }
      const z = zeilen.find((x) => x.id === m.id);
      if (!z) return;
      z.status = e.status; z.fehler = e.fehler;
      if (naechsterS === null) { z.zustand = 'aufgegeben'; z.erledigt = e.zeit; } else z.faellig = uhr() + naechsterS * 1000;
    },
    async probe(id, e) { const w = hooks.get(id); if (w) w.letzte = e; },
    async verlauf(id, anzahl) {
      return zeilen.filter((z) => z.webhookId === id).sort((a, b) => b.erstellt.localeCompare(a.erstellt)).slice(0, anzahl)
        .map((z) => ({ ereignisId: z.ereignisId, art: z.art, zustand: z.zustand, erstellt: z.erstellt, erledigt: z.erledigt, versuche: z.versuche, status: z.status, fehler: z.fehler }));
    },
    async raeumeAuf(tage) {
      const grenze = new Date(uhr() - tage * 86_400_000).toISOString();
      const vorher = zeilen.length;
      for (let i = zeilen.length - 1; i >= 0; i--) if (zeilen[i].zustand !== 'offen' && zeilen[i].erstellt < grenze) zeilen.splice(i, 1);
      return vorher - zeilen.length;
    },
  };
}

/* ---------- PostgreSQL ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zeile aus der Datenbank, Spalten werden einzeln übernommen
const alsWebhook = (r: any): WebhookDaten => ({
  id: r.id, benutzerId: r.benutzer_id, name: r.name, url: r.url, geheimnis: r.geheimnis, ereignisse: r.ereignisse ?? [],
  aktiv: r.aktiv, abgeschaltet: r.abgeschaltet ?? null, gemeldetStand: r.gemeldet_stand === null ? null : Number(r.gemeldet_stand),
  fehlerFolge: r.fehler_folge, letzte: r.letzte ?? null, erstellt: (r.erstellt as Date).toISOString(),
  offen: r.o_faellig ? { faellig: (r.o_faellig as Date).toISOString(), versuche: r.o_versuche as number } : null,
});

export function pgWebhookRepo(sql: postgres.Sql, haushaltId: string): WebhookRepo {
  const json = (w: unknown) => sql.json(w as postgres.JSONValue);
  const auswahl = sql`SELECT w.*, o.faellig AS o_faellig, o.versuche AS o_versuche FROM webhooks w
    LEFT JOIN webhook_meldungen o ON o.webhook_id = w.id AND o.zustand = 'offen'`;
  return {
    async liste(b) {
      if (b !== undefined && !istUuid(b)) return [];
      return (await sql`${auswahl} WHERE w.haushalt_id = ${haushaltId} ${b ? sql`AND w.benutzer_id = ${b}` : sql``} ORDER BY w.erstellt, w.id`).map(alsWebhook);
    },
    async hole(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`${auswahl} WHERE w.haushalt_id = ${haushaltId} AND w.id = ${id}`;
      return r ? alsWebhook(r) : undefined;
    },
    async lege(w) {
      await sql`INSERT INTO webhooks (id, haushalt_id, benutzer_id, name, url, geheimnis, ereignisse)
        VALUES (${w.id}, ${haushaltId}, ${w.benutzerId}, ${w.name}, ${w.url}, ${w.geheimnis}, ${w.ereignisse})`;
    },
    async aendere(id, d) {
      if (!istUuid(id)) return;
      await sql.begin(async (tx) => {
        const felder: Record<string, unknown> = {};
        if (d.name !== undefined) felder.name = d.name;
        if (d.url !== undefined) { felder.url = d.url; felder.gemeldet_stand = null; }
        if (d.geheimnis !== undefined) felder.geheimnis = d.geheimnis;
        if (d.aktiv !== undefined) felder.aktiv = d.aktiv;
        if (d.aktiv === true) { felder.gemeldet_stand = null; felder.fehler_folge = 0; }
        if (d.abgeschaltet !== undefined) felder.abgeschaltet = d.abgeschaltet === null ? null : json(d.abgeschaltet);
        if (Object.keys(felder).length) await tx`UPDATE webhooks SET ${tx(felder as Record<string, postgres.ParameterOrJSON<never>>)} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
        if (d.aktiv === false || d.url !== undefined) await tx`UPDATE webhook_meldungen SET zustand = 'verworfen', erledigt = now() WHERE webhook_id = ${id} AND zustand = 'offen'`;
      });
    },
    async loesche(id) { if (istUuid(id)) await sql`DELETE FROM webhooks WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async merkeStand(id, stand, daten, abstandS) {
      if (!istUuid(id)) return null;
      return sql.begin(async (tx) => {
        // Zeilensperre: gleichzeitige Prüfungen (auch auf mehreren Servern) melden einen Stand höchstens einmal.
        const [w] = await tx`SELECT gemeldet_stand, gesendet, aktiv FROM webhooks WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (!w || !w.aktiv || (w.gemeldet_stand !== null && Number(w.gemeldet_stand) >= stand)) return null;
        await tx`UPDATE webhooks SET gemeldet_stand = ${stand} WHERE id = ${id}`;
        const [o] = await tx`SELECT id, versuche FROM webhook_meldungen WHERE webhook_id = ${id} AND zustand = 'offen' FOR UPDATE`;
        if (o) {
          await tx`UPDATE webhook_meldungen SET daten = ${json(daten)}, ereignis_id = CASE WHEN versuche > 0 THEN ${randomUUID()}::uuid ELSE ereignis_id END WHERE id = ${o.id}`;
          return 'zusammengefasst' as const;
        }
        await tx`INSERT INTO webhook_meldungen (id, haushalt_id, webhook_id, ereignis_id, art, daten, faellig)
          VALUES (${randomUUID()}, ${haushaltId}, ${id}, ${randomUUID()}, 'zaehler.geaendert', ${json(daten)},
            greatest(now(), coalesce(${w.gesendet}::timestamptz + make_interval(secs => ${abstandS}), now())))`;
        return 'neu' as const;
      });
    },
    async faellige(anzahl, leaseS) {
      return sql.begin(async (tx) => {
        const rs = await tx`
          UPDATE webhook_meldungen m SET versuche = m.versuche + 1, faellig = now() + make_interval(secs => ${leaseS})
          FROM webhooks w
          WHERE m.id IN (SELECT m2.id FROM webhook_meldungen m2 JOIN webhooks w2 ON w2.id = m2.webhook_id
              WHERE m2.haushalt_id = ${haushaltId} AND m2.zustand = 'offen' AND m2.faellig <= now() AND w2.aktiv
              ORDER BY m2.faellig LIMIT ${anzahl} FOR UPDATE OF m2 SKIP LOCKED)
            AND w.id = m.webhook_id
          RETURNING m.id, m.webhook_id, m.ereignis_id, m.art, m.daten, m.erstellt, m.versuche, w.url, w.geheimnis, w.name, w.benutzer_id`;
        if (rs.length) await tx`UPDATE webhooks SET gesendet = now() WHERE id = ANY(${rs.map((r) => r.webhook_id as string)}::uuid[])`;
        return rs.map((r) => ({ id: r.id, webhookId: r.webhook_id, ereignisId: r.ereignis_id, art: r.art, daten: r.daten, erstellt: (r.erstellt as Date).toISOString(), versuch: r.versuche, url: r.url, geheimnis: r.geheimnis, name: r.name, benutzerId: r.benutzer_id }));
      });
    },
    async zugestellt(m, e, abstandS) {
      return sql.begin(async (tx) => {
        await tx`UPDATE webhooks SET fehler_folge = 0, letzte = ${json(e)} WHERE id = ${m.webhookId}`;
        const r = await tx`UPDATE webhook_meldungen SET zustand = 'zugestellt', status = ${e.status}, fehler = NULL, erledigt = now()
          WHERE id = ${m.id} AND ereignis_id = ${m.ereignisId} AND zustand = 'offen'`;
        if (r.count) return true;
        // Inzwischen neuere Zahlen: offen lassen, nach dem Mindestabstand noch einmal (neuer Anlauf, neue Ereignis-Id steht schon).
        await tx`UPDATE webhook_meldungen SET versuche = 0, fehler = NULL, faellig = now() + make_interval(secs => ${abstandS}) WHERE id = ${m.id} AND zustand = 'offen'`;
        return false;
      });
    },
    async fehlgeschlagen(m, e, naechsterS, ab) {
      await sql.begin(async (tx) => {
        await tx`UPDATE webhooks SET fehler_folge = fehler_folge + 1, letzte = ${json(e)}
          ${ab ? tx`, aktiv = false, abgeschaltet = ${json(ab)}` : tx``} WHERE id = ${m.webhookId}`;
        if (naechsterS === null) await tx`UPDATE webhook_meldungen SET zustand = 'aufgegeben', status = ${e.status}, fehler = ${(e.fehler ?? '').slice(0, 500)}, erledigt = now() WHERE id = ${m.id} AND zustand = 'offen'`;
        else await tx`UPDATE webhook_meldungen SET status = ${e.status}, fehler = ${(e.fehler ?? '').slice(0, 500)}, faellig = now() + make_interval(secs => ${naechsterS}) WHERE id = ${m.id} AND zustand = 'offen'`;
      });
    },
    async probe(id, e) { if (istUuid(id)) await sql`UPDATE webhooks SET letzte = ${json(e)} WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async verlauf(id, anzahl) {
      if (!istUuid(id)) return [];
      return (await sql`SELECT ereignis_id, art, zustand, erstellt, erledigt, versuche, status, fehler FROM webhook_meldungen
        WHERE haushalt_id = ${haushaltId} AND webhook_id = ${id} ORDER BY erstellt DESC, id LIMIT ${anzahl}`)
        .map((r) => ({ ereignisId: r.ereignis_id, art: r.art, zustand: r.zustand, erstellt: (r.erstellt as Date).toISOString(), erledigt: r.erledigt ? (r.erledigt as Date).toISOString() : null, versuche: r.versuche, status: r.status, fehler: r.fehler }));
    },
    async raeumeAuf(tage) {
      const r = await sql`DELETE FROM webhook_meldungen WHERE haushalt_id = ${haushaltId} AND zustand <> 'offen' AND erstellt < now() - make_interval(days => ${tage})`;
      return r.count;
    },
  };
}
