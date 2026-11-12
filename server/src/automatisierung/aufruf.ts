import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type postgres from 'postgres';
import { AUFRUF_GEHEIMNIS_PRAEFIX, AUFRUF_GRENZEN, AUFRUF_KENNUNG, AUFRUF_PFAD, aufrufParameter, istAufruf, type Automatisierung, type WennAufruf } from '../../../shared/src/automatisierung';
import { ipBereich, kuerzeIp } from '../abruf';
import { Fachfehler } from '../fehler';
import { AUFRUF_ANGENOMMEN_JE_ADRESSE, AUFRUF_FEHLVERSUCHE_GESAMT, AUFRUF_FEHLVERSUCHE_JE_ADRESSE, AUFRUF_JE_BEREICH } from '../grenzen';
import { hashe, speicherKurzzustand, type Kurzzustand } from '../kurzzustand';
import { protokoll } from '../protokoll';
import { istUuid } from '../repo';
import { t } from '../sprache';

/**
 * „Aufruf von außen“ (#679): eigene Adresse mit Geheimnis je Automatisierung. Die Adresse ist ohne Anmeldung erreichbar
 * (`POST /api/aufruf/:kennung`, offene Route mit Grund in `routen-liste.test.ts`) – darum diese Schutzmaßnahmen:
 *
 * - **Ausdrücklich angelegt:** Adresse und Geheimnis entstehen nur über „Adresse anlegen“ in der Werkbank (frische
 *   Anmeldung), nie beim Speichern und nie aus einem Paket. Ändert sich die Wenn-Karte, ist die Adresse weg.
 * - **Nicht ratbar:** Kennung 32 Byte Zufall (base64url), Geheimnis `whsec_` + 32 Byte Zufall. Das Geheimnis steht
 *   verschlüsselt in der Tabelle (`dms1$…`, Geheimnis-Art „aufruf“, beim Schlüsselwechsel umgeschlüsselt) und ist nur
 *   einmal vollständig in der Antwort auf „Adresse anlegen“ bzw. „Neues Geheimnis“ zu sehen.
 * - **Signatur wie beim Webhook (#627):** `X-DMS-Zeit` (Unix-Sekunden) und `X-DMS-Signatur: v1=<hex>`, HMAC-SHA256 über
 *   `<zeit>.<Rumpf>` – der Rumpf als Bytes, wie er ankam. Vergleich in konstanter Zeit; auch ohne Adresse rechnet der
 *   Server eine Signatur (kein Zeitunterschied zwischen „gibt es nicht“ und „falsch“).
 * - **Zeitfenster und Wiederholschutz:** Zeitstempel höchstens {@link AUFRUF_GRENZEN}.fensterS Sekunden daneben; jede
 *   angenommene Signatur ist so lange (doppelt) im Kurzzustand belegt – über alle Prozesse, eine zweite gleiche geht nicht.
 * - **Bremse über alle Prozesse** (Kurzzustand wie #956, Grenzen in `grenzen.ts`): vorab nur je IP-Bereich (IPv4 /24,
 *   IPv6 /64). Abgelehnte zählen je Adresse (bekannt oder nicht, als Hash) und insgesamt (Notbremse) – darüber nur noch
 *   „bremse“, ohne Zähler und Protokoll. Angenommene zählen nur je Adresse für sich. So legt niemand ohne Geheimnis eine
 *   Adresse oder alle zusammen still (Durchsicht Sicherheit, PR #1160); geprüft wird immer, die Prüfung ist billig.
 * - **Einheitliche Antwort:** Unbekannte Adresse, ausgeschaltete Automatisierung, falsche Signatur, alter Zeitstempel,
 *   Wiederholung – immer 401 mit demselben Text. Angenommen: 202 und nur „angenommen“, nie Daten aus der Ablage.
 * - **Parameter** nur die der Karte, nur Text, begrenzt ({@link aufrufParameter}); Größe des Rumpfs: `AUFRUF_KOERPER_MAX`.
 */

const log = protokoll.modul('automatisierung');

/** Kurzzustand: Bremse je IP-Bereich; abgelehnte je Adresse (Hash der Kennung) und insgesamt; angenommene je Adresse; gesehene Signaturen. */
const BREMSE_BEREICH = 'aufruf-bereich';
const FEHL_ADRESSE = 'aufruf-fehl-adresse';
const FEHL_GESAMT = 'aufruf-fehl-gesamt';
const ANGENOMMEN = 'aufruf-angenommen';
const GESEHEN = 'aufruf-gesehen';
const MINUTE = 60_000;

/** Gespeicherte Adresse einer Automatisierung (Geheimnis verschlüsselt). */
export interface AufrufEintrag {
  automatisierungId: string;
  kennung: string;
  /** Verschlüsselt („dms1$…“). */
  geheimnis: string;
  erstellt: string;
  erstelltVon: string | null;
  /** Wann das Geheimnis zuletzt neu erzeugt wurde. */
  geheimnisSeit: string;
}

export interface AufrufRepo {
  hole(automatisierungId: string): Promise<AufrufEintrag | undefined>;
  finde(kennung: string): Promise<AufrufEintrag | undefined>;
  liste(): Promise<AufrufEintrag[]>;
  /** Anlegen oder ersetzen (eine Adresse je Automatisierung). */
  setze(e: AufrufEintrag): Promise<void>;
  loesche(automatisierungId: string): Promise<void>;
}

export function speicherAufrufRepo(): AufrufRepo {
  const m = new Map<string, AufrufEintrag>();
  return {
    async hole(id) { const e = m.get(id); return e && { ...e }; },
    async finde(k) { const e = [...m.values()].find((x) => x.kennung === k); return e && { ...e }; },
    async liste() { return [...m.values()].map((e) => ({ ...e })).sort((a, b) => a.erstellt.localeCompare(b.erstellt)); },
    async setze(e) { m.set(e.automatisierungId, { ...e }); },
    async loesche(id) { m.delete(id); },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Zeilen aus der Datenbank, Spalten werden einzeln übernommen */
const iso = (d: any) => (d instanceof Date ? d.toISOString() : String(d));
const alsEintrag = (r: any): AufrufEintrag => ({
  automatisierungId: r.automatisierung_id, kennung: r.kennung, geheimnis: r.geheimnis, erstellt: iso(r.erstellt), erstelltVon: r.erstellt_von ?? null, geheimnisSeit: iso(r.geheimnis_seit),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Tabelle `automatisierung_aufrufe` (Migration 112); beim Löschen der Automatisierung geht die Zeile mit. */
export function pgAufrufRepo(sql: postgres.Sql, haushaltId: string): AufrufRepo {
  return {
    async hole(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${id}`;
      return r ? alsEintrag(r) : undefined;
    },
    async finde(k) {
      if (!AUFRUF_KENNUNG.test(k)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} AND kennung = ${k}`;
      return r ? alsEintrag(r) : undefined;
    },
    async liste() { return (await sql`SELECT * FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} ORDER BY erstellt, automatisierung_id`).map(alsEintrag); },
    async setze(e) {
      await sql`INSERT INTO automatisierung_aufrufe (automatisierung_id, haushalt_id, kennung, geheimnis, erstellt, erstellt_von, geheimnis_seit)
        VALUES (${e.automatisierungId}, ${haushaltId}, ${e.kennung}, ${e.geheimnis}, ${e.erstellt}, ${e.erstelltVon}, ${e.geheimnisSeit})
        ON CONFLICT (automatisierung_id) DO UPDATE SET kennung = EXCLUDED.kennung, geheimnis = EXCLUDED.geheimnis, erstellt = EXCLUDED.erstellt,
          erstellt_von = EXCLUDED.erstellt_von, geheimnis_seit = EXCLUDED.geheimnis_seit`;
    },
    async loesche(id) { if (istUuid(id)) await sql`DELETE FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${id}`; },
  };
}

/* ---------- Signatur ---------- */

/** Signatur: `v1=` und HMAC-SHA256 (hex) über `<zeit>.<rumpf>` mit dem Geheimnis (UTF-8) – wie der Webhook (#627). */
export function aufrufSignatur(geheimnis: string, zeit: number | string, rumpf: Buffer | string): string {
  return `v1=${createHmac('sha256', geheimnis).update(`${zeit}.`).update(rumpf).digest('hex')}`;
}

/** Passt eine der Signaturen im Kopf (durch Komma getrennt)? Vergleich in konstanter Zeit; immer alle geprüft. */
export function signaturPasst(geheimnis: string, zeit: number, rumpf: Buffer, kopf: string): boolean {
  const soll = Buffer.from(aufrufSignatur(geheimnis, zeit, rumpf));
  let ok = false;
  for (const s of kopf.split(',').slice(0, 5)) {
    const ist = Buffer.from(s.trim());
    // Auf die Länge der Soll-Signatur gebracht, damit timingSafeEqual immer rechnet; eine falsche Länge bleibt falsch.
    const gleichLang = Buffer.alloc(soll.length);
    ist.copy(gleichLang);
    ok = (timingSafeEqual(gleichLang, soll) && ist.length === soll.length) || ok;
  }
  return ok;
}

/** Bereich einer IP für die Bremse: IPv4 je /24, IPv6 je /64 (Sicherheit: ein Anschluss hat oft viele Adressen). */
export function aufrufBereich(ip: string | undefined): string {
  const a = (ip ?? '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').trim();
  if (isIP(a) === 4) return `${a.replace(/\.\d+$/, '.0')}/24`;
  return ipBereich(a);
}

/* ---------- Dienst ---------- */

export interface AufrufStand {
  /** Adresse (mit der Adresse von Ablago davor, sonst nur der Pfad). */
  adresse: string;
  erstellt: string;
  geheimnisSeit: string;
}

export interface AufrufDeps {
  repo: AufrufRepo;
  zustand?: () => Kurzzustand;
  verschluessele: (klartext: string) => string;
  entschluessele: (wert: string) => string | null;
  /** Adresse von Ablago für Links (ohne / am Ende), leer = nur der Pfad. */
  basis?: () => string;
  /** Die Automatisierung zur Id (aktuellster Stand). */
  automatisierung: (id: string) => Promise<Automatisierung | undefined>;
  /** Läuft die Automatisierung los (außerhalb der Anfrage); Ereignis-Id fest je Signatur. */
  ausloesen: (a: Automatisierung, ereignisId: string, daten: Record<string, unknown>) => Promise<void>;
  uhr?: () => number;
}

/** Ergebnis eines Aufrufs, wie die Route es weitergibt. */
export type AufrufErgebnis = { art: 'angenommen' } | { art: 'abgelehnt' } | { art: 'bremse' } | { art: 'inhalt' };

export class Aufrufe {
  private eigenerZustand?: Kurzzustand;
  constructor(private d: AufrufDeps) {}

  private jetzt() { return this.d.uhr?.() ?? Date.now(); }
  private zustand(): Kurzzustand { return this.d.zustand?.() ?? (this.eigenerZustand ??= speicherKurzzustand(() => this.jetzt())); }
  adresseVon(kennung: string): string { return `${(this.d.basis?.() ?? '').replace(/\/+$/, '')}${AUFRUF_PFAD}${kennung}`; }

  /** Stand für die Karte (ohne Geheimnis). */
  async stand(automatisierungId: string): Promise<AufrufStand | null> {
    const e = await this.d.repo.hole(automatisierungId);
    return e ? { adresse: this.adresseVon(e.kennung), erstellt: e.erstellt, geheimnisSeit: e.geheimnisSeit } : null;
  }

  /** Alle Adressen mit Automatisierung (Werkbank-Übersicht, Notfallblatt). */
  async liste(): Promise<Array<AufrufEintrag & { adresse: string }>> {
    return (await this.d.repo.liste()).map((e) => ({ ...e, adresse: this.adresseVon(e.kennung) }));
  }

  /**
   * Adresse anlegen bzw. erneuern (`adresse`: neue Kennung und neues Geheimnis) oder nur ein neues Geheimnis
   * (`geheimnis`). Das Geheimnis steht nur in dieser Antwort; die alte Adresse bzw. das alte Geheimnis gilt sofort nicht mehr.
   */
  async lege(a: Automatisierung, was: 'adresse' | 'geheimnis', von: string | null): Promise<AufrufStand & { geheimnis: string }> {
    if (!istAufruf(a.wenn)) throw new Fachfehler(409, t('meldungen.aufruf.keine-karte'));
    if (a.herkunft === 'paket') throw new Fachfehler(409, t('meldungen.aufruf.paket'));
    const alt = await this.d.repo.hole(a.id);
    if (was === 'geheimnis' && !alt) throw new Fachfehler(409, t('meldungen.aufruf.erst-adresse'));
    const geheimnis = `${AUFRUF_GEHEIMNIS_PRAEFIX}${randomBytes(32).toString('base64url')}`;
    const jetzt = new Date(this.jetzt()).toISOString();
    const e: AufrufEintrag = was === 'adresse' || !alt
      ? { automatisierungId: a.id, kennung: randomBytes(32).toString('base64url'), geheimnis: this.d.verschluessele(geheimnis), erstellt: jetzt, erstelltVon: von, geheimnisSeit: jetzt }
      : { ...alt, geheimnis: this.d.verschluessele(geheimnis), geheimnisSeit: jetzt };
    await this.d.repo.setze(e);
    log.info(was === 'adresse' ? (alt ? 'Adresse für Aufrufe von außen erneuert' : 'Adresse für Aufrufe von außen angelegt') : 'Geheimnis für Aufrufe von außen erneuert', { automatisierung: a.id, name: a.name });
    return { adresse: this.adresseVon(e.kennung), erstellt: e.erstellt, geheimnisSeit: e.geheimnisSeit, geheimnis };
  }

  /** Adresse entfernen (Automatisierung gelöscht, Wenn-Karte geändert, von Hand). */
  async entferne(automatisierungId: string, grund: string): Promise<boolean> {
    if (!(await this.d.repo.hole(automatisierungId))) return false;
    await this.d.repo.loesche(automatisierungId);
    log.info('Adresse für Aufrufe von außen entfernt', { automatisierung: automatisierungId, grund });
    return true;
  }

  /**
   * Ein Aufruf von außen. Reihenfolge: Bremse je IP-Bereich → Adresse und Automatisierung → Zeitstempel und Signatur
   * (immer gerechnet) → Wiederholung → Bremse für angenommene je Adresse → Parameter → auslösen. Was scheitert, ist
   * „abgelehnt“ ohne Grund nach außen und zählt als Fehlversuch ({@link abgelehnt}); im Protokoll steht nur der Grund und
   * die gekürzte IP, nie Kennung oder Signatur.
   */
  async annehmen(o: AufrufAnfrage): Promise<AufrufErgebnis> {
    const z = this.zustand();
    if ((await z.zaehle(BREMSE_BEREICH, aufrufBereich(o.ip), MINUTE)).anzahl > AUFRUF_JE_BEREICH) return { art: 'bremse' };
    const g = await this.pruefe(o);
    if ('grund' in g) return this.abgelehnt(o, g.grund, g.automatisierung);
    const { a, zeit, merker } = g;
    // Wiederholschutz über alle Prozesse: dieselbe Signatur nur einmal im Fenster (doppelt so lang belegt wie das Fenster).
    if (!(await z.belege(GESEHEN, merker, 2 * AUFRUF_GRENZEN.fensterS * 1000))) return this.abgelehnt(o, 'wiederholung', a.id);
    // Nur gültig signierte zählen hier – ohne das Geheimnis erreicht niemand diese Grenze.
    if ((await z.zaehle(ANGENOMMEN, hashe(o.kennung), MINUTE)).anzahl > AUFRUF_ANGENOMMEN_JE_ADRESSE) {
      await z.loesche(GESEHEN, merker); // derselbe Aufruf darf es nach der Bremse noch einmal versuchen
      log.info('Aufruf von außen gebremst', { grund: 'angenommen-je-adresse', automatisierung: a.id, ip: kuerzeIp(o.ip) });
      return { art: 'bremse' };
    }
    const roh = jsonObjekt(o.rumpf);
    if (roh === null) return { art: 'inhalt' };
    const parameter = aufrufParameter(a.wenn as WennAufruf, roh);
    log.info('Aufruf von außen angenommen', { automatisierung: a.id, name: a.name, parameter: Object.keys(parameter).length, ip: kuerzeIp(o.ip) });
    void this.d.ausloesen(a, uuidAusHash(merker), { zeitpunkt: new Date(zeit * 1000).toISOString(), parameter })
      .catch((x: Error) => log.warn('Aufruf von außen: Automatisierung nicht ausgelöst', { automatisierung: a.id, fehler: x.message }));
    return { art: 'angenommen' };
  }

  /**
   * Fehlversuch: zählt insgesamt (Notbremse) und je Adresse (auch unbekannte, nur als Hash – verrät nicht, welche es
   * gibt). Darüber „bremse“ ohne weiteren Zähler und ohne Protokoll; das Überschreiten selbst steht einmal im Protokoll.
   * Ein gültig signierter Aufruf kommt davon unberührt weiter durch.
   */
  private async abgelehnt(o: AufrufAnfrage, grund: string, automatisierung?: string): Promise<AufrufErgebnis> {
    const z = this.zustand();
    const gesamt = (await z.zaehle(FEHL_GESAMT, 'alle', MINUTE)).anzahl;
    if (gesamt > AUFRUF_FEHLVERSUCHE_GESAMT) {
      if (gesamt === AUFRUF_FEHLVERSUCHE_GESAMT + 1) log.warn('Aufrufe von außen: viele Fehlversuche, Notbremse', { anzahl: gesamt });
      return { art: 'bremse' };
    }
    if (AUFRUF_KENNUNG.test(o.kennung)) {
      const n = (await z.zaehle(FEHL_ADRESSE, hashe(o.kennung), MINUTE)).anzahl;
      if (n > AUFRUF_FEHLVERSUCHE_JE_ADRESSE) {
        if (n === AUFRUF_FEHLVERSUCHE_JE_ADRESSE + 1) log.info('Aufruf von außen gebremst', { grund: 'fehlversuche-je-adresse', ip: kuerzeIp(o.ip), ...(automatisierung ? { automatisierung } : {}) });
        return { art: 'bremse' };
      }
    }
    log.info('Aufruf von außen abgelehnt', { grund, ip: kuerzeIp(o.ip), ...(automatisierung ? { automatisierung } : {}) });
    return { art: 'abgelehnt' };
  }

  /**
   * Adresse, Automatisierung, Zeitstempel und Signatur. Ohne Adresse oder Geheimnis rechnet der Server trotzdem eine
   * Signatur (gleiche Arbeit, Wegwerf-Geheimnis) – kein Zeitunterschied zwischen „gibt es nicht“ und „falsch“.
   */
  private async pruefe(o: AufrufAnfrage): Promise<{ a: Automatisierung; zeit: number; merker: string } | { grund: string; automatisierung?: string }> {
    const e = AUFRUF_KENNUNG.test(o.kennung) ? await this.d.repo.finde(o.kennung) : undefined;
    const a = e ? await this.d.automatisierung(e.automatisierungId) : undefined;
    const klar = e ? this.d.entschluessele(e.geheimnis) : null;
    const geheimnis = klar ?? randomBytes(32).toString('base64url');
    const zeit = /^\d{1,12}$/.test(o.zeit?.trim() ?? '') ? Number(o.zeit) : 0;
    const zeitOk = zeit > 0 && Math.abs(this.jetzt() / 1000 - zeit) <= AUFRUF_GRENZEN.fensterS;
    const sigOk = signaturPasst(geheimnis, zeit, o.rumpf, o.signatur ?? '');
    const bereit = !!a && !!klar && a.aktiv && !a.angehalten && istAufruf(a.wenn);
    if (bereit && zeitOk && sigOk) return { a, zeit, merker: hashe(`${o.kennung}|${zeit}|${aufrufSignatur(geheimnis, zeit, o.rumpf)}`) };
    return { grund: ablehnGrund(!!e, bereit, zeitOk), ...(a ? { automatisierung: a.id } : {}) };
  }
}

/** Grund fürs Protokoll (nie nach außen). */
const ablehnGrund = (adresse: boolean, bereit: boolean, zeitOk: boolean) => (!adresse ? 'adresse' : !bereit ? 'aus' : !zeitOk ? 'zeit' : 'signatur');

/** Was die Route übergibt: Kennung aus der Adresse, Köpfe, Rumpf als Bytes, IP. */
export interface AufrufAnfrage { kennung: string; zeit?: string; signatur?: string; rumpf: Buffer; ip?: string }

/** Rumpf als JSON-Objekt: leer = {}, sonst nur ein Objekt – alles andere null. */
function jsonObjekt(rumpf: Buffer): Record<string, unknown> | null {
  const text = rumpf.toString('utf8').trim();
  if (!text) return {};
  try {
    const x: unknown = JSON.parse(text);
    return x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
  } catch { return null; }
}

/** Feste UUID aus dem Merker (gleicher Aufruf = gleiche Ereignis-Id; der Motor legt je Ereignis genau einen Lauf an). */
const uuidAusHash = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
