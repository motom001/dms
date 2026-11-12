import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { AUFRUF_GEHEIMNIS_PRAEFIX, AUSSEN_GRENZEN, bereinigeZiele, zielFuer, zielHost, type Automatisierung, type AussenZiel } from '../../../shared/src/automatisierung';
import { wiederholungNach } from '../../../shared/src/ereignisse';
import { gekuerzteAdresse } from '../../../shared/src/notfallkontakte';
import type { Einstellungen } from '../einstellungen';
import { Fachfehler } from '../fehler';
import type { Mailer } from '../mail';
import { protokoll } from '../protokoll';
import { istUuid } from '../repo';
import { t } from '../sprache';
import { sichererAbruf, type SichererAbruf } from './sicherer-abruf';

/**
 * Ausgangskorb der Karten nach außen (#671): „URL aufrufen“ und „E-Mail senden“ legen ihre Zustellung hier hinein; der
 * Leiter stellt zu, mit Wiederholung und – nach Dauerfehlern – Anhalten der Automatisierung mit Hinweis.
 *
 * - **Freigegebene Ziele** (Einstellung `automatisierung_ziele`): Nur Adressen darunter ruft Ablago auf – geprüft beim
 *   Speichern der Karte, beim Hineinlegen und noch einmal beim Zustellen (ein entzogenes Ziel hält die Automatisierung an).
 * - **Mindestens einmal:** je Automatisierung, Karte, Ereignis und Empfänger genau ein Eintrag (eindeutig); der Server
 *   holt fällige mit `FOR UPDATE SKIP LOCKED` und einer Frist ({@link LEASE_S}), stirbt er, holt sie ein anderer. Die
 *   Ereignis-Id geht im Kopf `X-DMS-Ereignis` mit – der Empfänger erkennt Doppelte.
 * - **Wiederholen** nach dem Plan des Ausgangskorbs der Ereignisse (1, 5, 30 Minuten, 2 und 6 Stunden); Netzfehler,
 *   Zeitlimit, 408, 429 und 5xx werden wiederholt. **Dauerfehler** (nach dem letzten Versuch, Weiterleitung, 4xx,
 *   gesperrte Adresse, Ziel nicht mehr freigegeben) geben auf und halten die Automatisierung an (Grund „ziel“) – die
 *   Werkbank und die Mail der technischen Aufgaben weisen darauf hin. Offene Zustellungen einer angehaltenen
 *   Automatisierung werden verworfen.
 * - **Ohne Inhalte im Verlauf:** Der Auftrag (Rumpf, Betreff, Text) steht nur bis zur Zustellung bzw. Aufgabe in der
 *   Tabelle; danach bleiben Ziel (Rechner bzw. gekürzte Adresse), Zustand, Status, Fehler und Zeiten – 30 Tage.
 * - **Signatur** wie beim Aufruf von außen (#679, Schema #627): `X-DMS-Zeit` und `X-DMS-Signatur: v1=<hex>`, HMAC-SHA256
 *   über `<zeit>.<rumpf>` (bei GET statt des Rumpfs Pfad und Abfrage). Geheimnis je Karte, verschlüsselt
 *   (Geheimnis-Art „aussen“), nur einmal in der Antwort auf „Geheimnis anlegen“.
 * - **Bremse E-Mail** über alle Prozesse (gezählt in der Tabelle): je Automatisierung und Tag, alle zusammen je Tag.
 */

const log = protokoll.modul('automatisierung');
/** Frist, in der ein Server eine geholte Zustellung erledigen muss, sonst holt sie ein anderer. */
const LEASE_S = 120;
/** So oft sieht der Leiter nach. */
const ZUSTELL_MS = 5_000;
/** Erledigtes bleibt so lange im Verlauf. */
const VERLAUF_TAGE = 30;
/** Einstellung mit den freigegebenen Zielen. */
export const ZIELE_SCHLUESSEL = 'automatisierung_ziele';

export type AusgangArt = 'url' | 'email';
export type AusgangZustand = 'offen' | 'zugestellt' | 'aufgegeben' | 'verworfen';

/** Was zugestellt wird – nur bis zur Zustellung gespeichert. */
export type AusgangAuftrag =
  | { art: 'url'; adresse: string; methode: 'GET' | 'POST'; rumpf: string | null }
  | { art: 'email'; an: string; betreff: string; text: string };

export interface AusgangEintrag {
  id: string; automatisierungId: string; karte: string; laufId: string | null; ereignisId: string;
  art: AusgangArt;
  /** Eindeutig je Automatisierung, Karte, Ereignis: Hash aus Empfänger bzw. Adresse. */
  schluessel: string;
  /** Anzeige: Rechner bzw. gekürzte Adresse. */
  ziel: string;
  auftrag: AusgangAuftrag | null;
  zustand: AusgangZustand; versuche: number; faellig: string;
  status: number | null; fehler: string | null; erstellt: string; erledigt: string | null;
}
/** Für den Verlauf (Werkbank): ohne Auftrag. */
export type AusgangVerlauf = Omit<AusgangEintrag, 'auftrag' | 'schluessel'>;

export interface AusgangRepo {
  /** Hineinlegen; false, wenn es den Eintrag (Automatisierung, Karte, Ereignis, Schlüssel) schon gibt. */
  lege(e: AusgangEintrag): Promise<boolean>;
  /** Fällige holen: Versuch zählt hoch, fällig erst wieder nach `leaseS` (falls der Server stirbt). */
  faellige(anzahl: number, leaseS: number, jetzt: string): Promise<AusgangEintrag[]>;
  /** Abschließen (zugestellt, aufgegeben, verworfen): Auftrag weg. */
  schliesse(id: string, z: Exclude<AusgangZustand, 'offen'>, status: number | null, fehler: string | null, jetzt: string): Promise<void>;
  /** Später noch einmal. */
  spaeter(id: string, faellig: string, status: number | null, fehler: string | null): Promise<void>;
  /** Offene einer Automatisierung verwerfen (angehalten); liefert die Zahl. */
  verwerfe(automatisierungId: string, fehler: string, jetzt: string): Promise<number>;
  /** E-Mails seit `seit` – einer Automatisierung oder aller (null). Verworfene zählen nicht. */
  zaehleMails(automatisierungId: string | null, seit: string): Promise<number>;
  verlauf(automatisierungId: string, anzahl: number): Promise<AusgangVerlauf[]>;
  raeumeAuf(vor: string): Promise<number>;
}

/** Geheimnis je Karte „URL aufrufen“ (verschlüsselt). */
export interface AussenGeheimnis { automatisierungId: string; karte: string; geheimnis: string; erstellt: string; erstelltVon: string | null }
export interface AussenGeheimnisRepo {
  hole(automatisierungId: string, karte: string): Promise<AussenGeheimnis | undefined>;
  liste(automatisierungId: string): Promise<AussenGeheimnis[]>;
  setze(g: AussenGeheimnis): Promise<void>;
  /** Ohne Karte: alle der Automatisierung. */
  loesche(automatisierungId: string, karte?: string): Promise<void>;
}

/** Für den Verlauf: ohne Auftrag und Schlüssel (nie Inhalte, nie ein Hash der Adresse). */
const ohneAuftrag = (e: AusgangEintrag): AusgangVerlauf => ({
  id: e.id, automatisierungId: e.automatisierungId, karte: e.karte, laufId: e.laufId, ereignisId: e.ereignisId, art: e.art, ziel: e.ziel,
  zustand: e.zustand, versuche: e.versuche, faellig: e.faellig, status: e.status, fehler: e.fehler, erstellt: e.erstellt, erledigt: e.erledigt,
});

/* ---------- Speicher (Tests, ohne Datenbank) ---------- */

export function speicherAusgangRepo(): AusgangRepo {
  const m = new Map<string, AusgangEintrag>();
  const kopie = (e: AusgangEintrag) => ({ ...e, auftrag: e.auftrag && { ...e.auftrag } });
  return {
    async lege(e) {
      if ([...m.values()].some((x) => x.automatisierungId === e.automatisierungId && x.karte === e.karte && x.ereignisId === e.ereignisId && x.schluessel === e.schluessel)) return false;
      m.set(e.id, kopie(e)); return true;
    },
    async faellige(n, leaseS, jetzt) {
      const liste = [...m.values()].filter((e) => e.zustand === 'offen' && e.faellig <= jetzt).sort((a, b) => a.faellig.localeCompare(b.faellig)).slice(0, n);
      for (const e of liste) { e.versuche++; e.faellig = new Date(Date.parse(jetzt) + leaseS * 1000).toISOString(); }
      return liste.map(kopie);
    },
    async schliesse(id, z, status, fehler, jetzt) { const e = m.get(id); if (e) Object.assign(e, { zustand: z, status, fehler, erledigt: jetzt, auftrag: null }); },
    async spaeter(id, faellig, status, fehler) { const e = m.get(id); if (e) Object.assign(e, { faellig, status, fehler }); },
    async verwerfe(aid, fehler, jetzt) { let n = 0; for (const e of m.values()) if (e.automatisierungId === aid && e.zustand === 'offen') { Object.assign(e, { zustand: 'verworfen', fehler, erledigt: jetzt, auftrag: null }); n++; } return n; },
    async zaehleMails(aid, seit) { return [...m.values()].filter((e) => e.art === 'email' && e.zustand !== 'verworfen' && e.erstellt >= seit && (!aid || e.automatisierungId === aid)).length; },
    async verlauf(aid, n) { return [...m.values()].filter((e) => e.automatisierungId === aid).sort((a, b) => b.erstellt.localeCompare(a.erstellt)).slice(0, n).map(ohneAuftrag); },
    async raeumeAuf(vor) { let n = 0; for (const [id, e] of m) if (e.zustand !== 'offen' && e.erstellt < vor) { m.delete(id); n++; } return n; },
  };
}

export function speicherAussenGeheimnisRepo(): AussenGeheimnisRepo {
  const m = new Map<string, AussenGeheimnis>();
  const k = (a: string, b: string) => `${a}|${b}`;
  return {
    async hole(a, b) { const g = m.get(k(a, b)); return g && { ...g }; },
    async liste(a) { return [...m.values()].filter((g) => g.automatisierungId === a).map((g) => ({ ...g })); },
    async setze(g) { m.set(k(g.automatisierungId, g.karte), { ...g }); },
    async loesche(a, b) { for (const g of [...m.values()]) if (g.automatisierungId === a && (b === undefined || g.karte === b)) m.delete(k(a, g.karte)); },
  };
}

/* ---------- PostgreSQL (Migration 115) ---------- */

/* eslint-disable @typescript-eslint/no-explicit-any -- Zeilen aus der Datenbank, Spalten werden einzeln übernommen */
const iso = (d: any) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const alsEintrag = (r: any): AusgangEintrag => ({
  id: r.id, automatisierungId: r.automatisierung_id, karte: r.karte, laufId: r.lauf_id ?? null, ereignisId: r.ereignis_id, art: r.art, schluessel: r.schluessel,
  ziel: r.ziel, auftrag: r.auftrag ?? null, zustand: r.zustand, versuche: r.versuche, faellig: iso(r.faellig)!, status: r.status ?? null, fehler: r.fehler ?? null,
  erstellt: iso(r.erstellt)!, erledigt: iso(r.erledigt),
});
const alsGeheimnis = (r: any): AussenGeheimnis => ({ automatisierungId: r.automatisierung_id, karte: r.karte, geheimnis: r.geheimnis, erstellt: iso(r.erstellt)!, erstelltVon: r.erstellt_von ?? null });
/* eslint-enable @typescript-eslint/no-explicit-any */

export function pgAusgangRepo(sql: postgres.Sql, haushaltId: string): AusgangRepo {
  return {
    async lege(e) {
      const r = await sql`INSERT INTO automatisierung_ausgang (id, haushalt_id, automatisierung_id, karte, lauf_id, ereignis_id, art, schluessel, ziel, auftrag, zustand, versuche, faellig, erstellt)
        VALUES (${e.id}, ${haushaltId}, ${e.automatisierungId}, ${e.karte}, ${e.laufId}, ${e.ereignisId}, ${e.art}, ${e.schluessel}, ${e.ziel}, ${sql.json(e.auftrag as postgres.JSONValue)}, 'offen', 0, ${e.faellig}, ${e.erstellt})
        ON CONFLICT (automatisierung_id, karte, ereignis_id, schluessel) DO NOTHING RETURNING id`;
      return r.length > 0;
    },
    async faellige(n, leaseS, jetzt) {
      return (await sql`UPDATE automatisierung_ausgang SET versuche = versuche + 1, faellig = ${jetzt}::timestamptz + make_interval(secs => ${leaseS})
        WHERE id IN (SELECT id FROM automatisierung_ausgang WHERE haushalt_id = ${haushaltId} AND zustand = 'offen' AND faellig <= ${jetzt}
          ORDER BY faellig LIMIT ${n} FOR UPDATE SKIP LOCKED) RETURNING *`).map(alsEintrag);
    },
    async schliesse(id, z, status, fehler, jetzt) {
      await sql`UPDATE automatisierung_ausgang SET zustand = ${z}, status = ${status}, fehler = ${fehler}, erledigt = ${jetzt}, auftrag = NULL WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async spaeter(id, faellig, status, fehler) { await sql`UPDATE automatisierung_ausgang SET faellig = ${faellig}, status = ${status}, fehler = ${fehler} WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async verwerfe(aid, fehler, jetzt) {
      if (!istUuid(aid)) return 0;
      return (await sql`UPDATE automatisierung_ausgang SET zustand = 'verworfen', fehler = ${fehler}, erledigt = ${jetzt}, auftrag = NULL
        WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${aid} AND zustand = 'offen' RETURNING id`).length;
    },
    async zaehleMails(aid, seit) {
      const [r] = aid
        ? await sql`SELECT count(*)::int AS n FROM automatisierung_ausgang WHERE haushalt_id = ${haushaltId} AND art = 'email' AND zustand <> 'verworfen' AND erstellt >= ${seit} AND automatisierung_id = ${aid}`
        : await sql`SELECT count(*)::int AS n FROM automatisierung_ausgang WHERE haushalt_id = ${haushaltId} AND art = 'email' AND zustand <> 'verworfen' AND erstellt >= ${seit}`;
      return Number(r.n);
    },
    async verlauf(aid, n) {
      if (!istUuid(aid)) return [];
      return (await sql`SELECT * FROM automatisierung_ausgang WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${aid} ORDER BY erstellt DESC, id LIMIT ${n}`)
        .map((r) => ohneAuftrag(alsEintrag(r)));
    },
    async raeumeAuf(vor) { return (await sql`DELETE FROM automatisierung_ausgang WHERE haushalt_id = ${haushaltId} AND zustand <> 'offen' AND erstellt < ${vor} RETURNING id`).length; },
  };
}

export function pgAussenGeheimnisRepo(sql: postgres.Sql, haushaltId: string): AussenGeheimnisRepo {
  return {
    async hole(a, k) {
      if (!istUuid(a)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierung_geheimnisse WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} AND karte = ${k}`;
      return r ? alsGeheimnis(r) : undefined;
    },
    async liste(a) { return istUuid(a) ? (await sql`SELECT * FROM automatisierung_geheimnisse WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} ORDER BY karte`).map(alsGeheimnis) : []; },
    async setze(g) {
      await sql`INSERT INTO automatisierung_geheimnisse (automatisierung_id, karte, haushalt_id, geheimnis, erstellt, erstellt_von)
        VALUES (${g.automatisierungId}, ${g.karte}, ${haushaltId}, ${g.geheimnis}, ${g.erstellt}, ${g.erstelltVon})
        ON CONFLICT (automatisierung_id, karte) DO UPDATE SET geheimnis = EXCLUDED.geheimnis, erstellt = EXCLUDED.erstellt, erstellt_von = EXCLUDED.erstellt_von`;
    },
    async loesche(a, k) {
      if (!istUuid(a)) return;
      if (k === undefined) await sql`DELETE FROM automatisierung_geheimnisse WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a}`;
      else await sql`DELETE FROM automatisierung_geheimnisse WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} AND karte = ${k}`;
    },
  };
}

/* ---------- Signatur ---------- */

/** Signatur: `v1=` und HMAC-SHA256 (hex) über `<zeit>.<inhalt>` – dasselbe Schema wie der Aufruf von außen (#679). */
export function aussenSignatur(geheimnis: string, zeit: number | string, inhalt: string): string {
  return `v1=${createHmac('sha256', geheimnis).update(`${zeit}.`).update(inhalt).digest('hex')}`;
}

/** Was signiert wird: bei POST der Rumpf, bei GET Pfad und Abfrage, wie sie in der Anfrage stehen. */
export function signierterInhalt(adresse: string, methode: 'GET' | 'POST', rumpf: string | null): string {
  if (methode === 'POST') return rumpf ?? '';
  const u = new URL(adresse);
  return `${u.pathname}${u.search}`;
}

/* ---------- Dienst ---------- */

export interface AusleitungDeps {
  repo: AusgangRepo;
  geheimnisse: AussenGeheimnisRepo;
  einstellungen: Einstellungen;
  verschluessele: (klartext: string) => string;
  entschluessele: (wert: string) => string | null;
  /** Die Automatisierung zur Id (aktueller Stand). */
  automatisierung: (id: string) => Promise<Automatisierung | undefined>;
  /** Dauerfehler: Automatisierung anhalten (Grund „ziel“). */
  anhalten: (id: string, text: string) => Promise<void>;
  /** Mailversand, null = nicht eingerichtet (dann später noch einmal). */
  mailer: () => Mailer | null;
  /** Grund für eine Pause (Wartung, Wiederherstellung): dann wird nichts zugestellt. */
  pause?: () => string | null;
  abruf?: SichererAbruf;
  uhr?: () => number;
}

export class Ausleitung {
  private zeit: ReturnType<typeof setInterval> | null = null;
  private laeuft: Promise<number> | null = null;
  constructor(private d: AusleitungDeps) {}

  private jetzt() { return this.d.uhr?.() ?? Date.now(); }
  private iso(ms = 0) { return new Date(this.jetzt() + ms).toISOString(); }

  /* --- Ziele --- */

  async ziele(): Promise<AussenZiel[]> { return bereinigeZiele(await this.d.einstellungen.lies(ZIELE_SCHLUESSEL)).ziele; }

  /** Ziele setzen (Werkbank): ganze Liste; Fehler je Zeile als 422. Neue Ziele mit Zeit und Person. */
  async setzeZiele(roh: unknown, von: string | null): Promise<AussenZiel[]> {
    const { ziele, fehler } = bereinigeZiele(roh);
    if (fehler.length) throw new Fachfehler(422, fehler[0], { probleme: fehler });
    const alt = await this.ziele();
    const liste = ziele.map((z) => { const a = alt.find((x) => x.adresse === z.adresse); return { ...z, erstellt: a?.erstellt ?? this.iso(), von: a?.von ?? von }; });
    await this.d.einstellungen.schreibe(ZIELE_SCHLUESSEL, liste);
    const neu = liste.filter((z) => !alt.some((a) => a.adresse === z.adresse)).map((z) => z.adresse);
    const weg = alt.filter((a) => !liste.some((z) => z.adresse === a.adresse)).map((a) => a.adresse);
    if (neu.length || weg.length) log.info('Ziele nach außen geändert', { neu: neu.join(', ') || '–', entfernt: weg.join(', ') || '–', heimnetz: liste.filter((z) => z.heimnetz).length });
    return liste;
  }

  /* --- Geheimnisse --- */

  /** Neues Geheimnis für eine Karte „URL aufrufen“ – nur in dieser Antwort; das alte gilt sofort nicht mehr. */
  async geheimnisAnlegen(a: Automatisierung, karte: string, von: string | null): Promise<{ geheimnis: string; erstellt: string }> {
    if (a.herkunft === 'paket') throw new Fachfehler(409, t('meldungen.aussen.paket'));
    if (![...a.dann, ...a.sonst].some((k) => k.id === karte && k.art === 'url')) throw new Fachfehler(404, t('meldungen.aussen.keine-karte'));
    const klar = `${AUFRUF_GEHEIMNIS_PRAEFIX}${randomBytes(32).toString('base64url')}`;
    const erstellt = this.iso();
    await this.d.geheimnisse.setze({ automatisierungId: a.id, karte, geheimnis: this.d.verschluessele(klar), erstellt, erstelltVon: von });
    log.info('Geheimnis für „URL aufrufen“ angelegt', { automatisierung: a.id, name: a.name, karte });
    return { geheimnis: klar, erstellt };
  }

  async geheimnisEntfernen(automatisierungId: string, karte?: string): Promise<void> { await this.d.geheimnisse.loesche(automatisierungId, karte); }

  /** Welche Karten ein Geheimnis haben (ohne Geheimnis). */
  async geheimnisStand(automatisierungId: string): Promise<Array<{ karte: string; erstellt: string }>> {
    return (await this.d.geheimnisse.liste(automatisierungId)).map((g) => ({ karte: g.karte, erstellt: g.erstellt }));
  }

  /* --- Hineinlegen --- */

  /** Eine Zustellung „URL aufrufen“. Das Ziel muss freigegeben sein (sonst 422). */
  async legeUrl(a: Automatisierung, o: { karte: string; laufId: string | null; ereignisId: string; adresse: string; methode: 'GET' | 'POST'; rumpf: string | null }): Promise<boolean> {
    if (!zielFuer(o.adresse, await this.ziele())) throw new Fachfehler(422, t('meldungen.aussen.ziel', { host: zielHost(o.adresse) }));
    return this.d.repo.lege({
      id: randomUUID(), automatisierungId: a.id, karte: o.karte, laufId: o.laufId, ereignisId: o.ereignisId, art: 'url',
      schluessel: hash(o.adresse), ziel: zielHost(o.adresse), auftrag: { art: 'url', adresse: o.adresse, methode: o.methode, rumpf: o.rumpf },
      zustand: 'offen', versuche: 0, faellig: this.iso(), status: null, fehler: null, erstellt: this.iso(), erledigt: null,
    });
  }

  /**
   * E-Mails einer Karte (je Empfänger eine). Bremse über alle Prozesse: je Automatisierung und Tag, alle zusammen je
   * Tag (429, nichts hineingelegt). Liefert die Zahl neu hineingelegter.
   */
  async legeMails(a: Automatisierung, o: { karte: string; laufId: string | null; ereignisId: string }, mails: Array<{ an: string; betreff: string; text: string }>): Promise<number> {
    const seit = new Date(this.jetzt() - 24 * 3600_000).toISOString();
    const eigene = await this.d.repo.zaehleMails(a.id, seit);
    if (eigene + mails.length > AUSSEN_GRENZEN.mailsJeAutomatisierungJeTag) throw new Fachfehler(429, t('meldungen.aussen.bremse', { anzahl: AUSSEN_GRENZEN.mailsJeAutomatisierungJeTag }));
    const alle = await this.d.repo.zaehleMails(null, seit);
    if (alle + mails.length > AUSSEN_GRENZEN.mailsJeTag) throw new Fachfehler(429, t('meldungen.aussen.bremse-alle', { anzahl: AUSSEN_GRENZEN.mailsJeTag }));
    let n = 0;
    for (const m of mails) {
      const ok = await this.d.repo.lege({
        id: randomUUID(), automatisierungId: a.id, karte: o.karte, laufId: o.laufId, ereignisId: o.ereignisId, art: 'email',
        schluessel: hash(m.an.toLowerCase()), ziel: gekuerzteAdresse(m.an), auftrag: { art: 'email', an: m.an, betreff: m.betreff, text: m.text },
        zustand: 'offen', versuche: 0, faellig: this.iso(), status: null, fehler: null, erstellt: this.iso(), erledigt: null,
      });
      if (ok) n++;
    }
    return n;
  }

  async verlauf(automatisierungId: string): Promise<AusgangVerlauf[]> { return this.d.repo.verlauf(automatisierungId, AUSSEN_GRENZEN.verlauf); }

  /** Offene Zustellungen verwerfen (Automatisierung gelöscht oder angehalten). */
  verwerfe(automatisierungId: string, grund: string) { return this.d.repo.verwerfe(automatisierungId, grund, this.iso()); }

  /* --- Zustellen --- */

  start() { this.zeit ??= setInterval(() => { void this.zustellen().catch((e) => log.error('Ausgangskorb nach außen: Zustellen fehlgeschlagen', { fehler: (e as Error).message })); }, ZUSTELL_MS); this.zeit.unref?.(); }
  stop() { if (this.zeit) clearInterval(this.zeit); this.zeit = null; }

  /** Alles Fällige zustellen; liefert die Zahl der bearbeiteten Einträge. Läuft schon ein Durchgang, wartet es auf ihn. */
  async zustellen(): Promise<number> {
    if (this.laeuft) return this.laeuft;
    this.laeuft = (async () => {
      if (this.d.pause?.()) return 0;
      let n = 0;
      for (;;) {
        const liste = await this.d.repo.faellige(20, LEASE_S, this.iso());
        if (!liste.length) break;
        for (const e of liste) { await this.eine(e); n++; }
      }
      await this.d.repo.raeumeAuf(this.iso(-VERLAUF_TAGE * 86_400_000));
      return n;
    })().finally(() => { this.laeuft = null; });
    return this.laeuft;
  }

  private async eine(e: AusgangEintrag): Promise<void> {
    const a = await this.d.automatisierung(e.automatisierungId);
    if (!a || a.angehalten || !e.auftrag) { await this.d.repo.schliesse(e.id, 'verworfen', null, t('meldungen.aussen.verworfen'), this.iso()); return; }
    const r = e.auftrag.art === 'url' ? await this.sendeUrl(a, e, e.auftrag) : await this.sendeMail(e.auftrag);
    if (r.ok) { await this.d.repo.schliesse(e.id, 'zugestellt', r.status, null, this.iso()); return; }
    const warte = r.dauerhaft ? null : wiederholungNach(e.versuche - 1);
    if (warte !== null) {
      await this.d.repo.spaeter(e.id, this.iso(warte * 1000), r.status, r.fehler);
      log.info('Zustellung nach außen wird wiederholt', { automatisierung: a.id, ziel: e.ziel, versuch: e.versuche, fehler: r.fehler });
      return;
    }
    // Dauerfehler: aufgeben, Automatisierung anhalten, offene verwerfen – Hinweis in der Werkbank und per Mail.
    await this.d.repo.schliesse(e.id, 'aufgegeben', r.status, r.fehler, this.iso());
    const text = t('meldungen.aussen.angehalten', { ziel: e.ziel, fehler: r.fehler ?? '?' });
    await this.d.anhalten(a.id, text);
    await this.d.repo.verwerfe(a.id, t('meldungen.aussen.verworfen'), this.iso());
    log.warn('Zustellung nach außen aufgegeben – Automatisierung angehalten', { automatisierung: a.id, name: a.name, ziel: e.ziel, versuche: e.versuche, fehler: r.fehler });
  }

  private async sendeUrl(a: Automatisierung, e: AusgangEintrag, x: Extract<AusgangAuftrag, { art: 'url' }>) {
    const ziel = zielFuer(x.adresse, await this.ziele());
    if (!ziel) return { ok: false, status: null, fehler: t('meldungen.aussen.ziel', { host: zielHost(x.adresse) }), dauerhaft: true };
    const koepfe: Record<string, string> = { 'x-dms-ereignis': e.ereignisId, 'x-dms-zustellung': e.id };
    if (x.methode === 'POST') koepfe['content-type'] = 'application/json; charset=utf-8';
    const g = await this.d.geheimnisse.hole(a.id, e.karte);
    if (g) {
      const klar = this.d.entschluessele(g.geheimnis);
      if (klar === null) return { ok: false, status: null, fehler: t('meldungen.aussen.geheimnis'), dauerhaft: true };
      const zeit = Math.floor(this.jetzt() / 1000);
      koepfe['x-dms-zeit'] = String(zeit);
      koepfe['x-dms-signatur'] = aussenSignatur(klar, zeit, signierterInhalt(x.adresse, x.methode, x.rumpf));
    }
    return (this.d.abruf ?? sichererAbruf)({ adresse: x.adresse, methode: x.methode, koepfe, rumpf: x.methode === 'POST' ? Buffer.from(x.rumpf ?? '', 'utf8') : undefined, heimnetz: ziel.heimnetz });
  }

  private async sendeMail(x: Extract<AusgangAuftrag, { art: 'email' }>) {
    const m = this.d.mailer();
    if (!m) return { ok: false, status: null, fehler: t('meldungen.aussen.kein-mailversand'), dauerhaft: false };
    try { await m.sende(x.an, x.betreff, x.text, { anImProtokoll: gekuerzteAdresse(x.an) }); return { ok: true, status: null, fehler: null, dauerhaft: false }; } catch (f) { return { ok: false, status: null, fehler: (f as Error).message.slice(0, 300), dauerhaft: false }; }
  }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
