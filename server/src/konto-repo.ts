import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { KEINE_ABWESENHEIT, type Abwesenheit, type Benutzer, type Rolle, type Sitzung, type Vertretung } from '../../shared/src/model';
import { dienstEmail, istUuid } from './repo';
import { ohneWarten } from './repo-pg';
import { staendeAusZeile, standSpalten } from './lesespeicher';

/** Adresse eines Dienstkontos: nie zustellbar (.invalid, RFC 2606). */
/** Adresse eines Dienstkontos – mit Haushalt, weil die Adresse über alle Haushalte eindeutig ist (benutzer_email_uq). */
/** „Zuletzt geöffnet“ (#940): Einträge `{ id, am }`; frühere Listen hatten nur die Id. */
export interface ZuletztEintrag { id: string; am: string | null }
export function zuletztListe(roh: unknown): ZuletztEintrag[] {
  if (!Array.isArray(roh)) return [];
  const aus: ZuletztEintrag[] = [];
  for (const x of roh) {
    if (typeof x === 'string') aus.push({ id: x, am: null });
    else if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') {
      const am = (x as { am?: unknown }).am;
      aus.push({ id: (x as { id: string }).id, am: typeof am === 'string' ? am : null });
    }
  }
  return aus;
}
/** Wer dieselbe Mappe gleich wieder öffnet oder ändert, schreibt höchstens einmal je Minute (#615). */
export const ZULETZT_RUHE_MS = 60_000;

/** Adresse eines Dienstkontos; steht in repo.ts, weil auch der Umzug einer Paket-Id (#1084) sie braucht. */
export { dienstEmail };
/** Adresse eines Systemkontos (#673), ebenso nie zustellbar. */
export const systemEmail = (kennung: string, haushaltId: string) => `${kennung}.${haushaltId}@system.invalid`;

export type Zweck = 'einladung' | 'zuruecksetzen';
/** Neue Person; `verwaltung` = Verwaltungsrecht (#818), sonst keines. Eine Rolle wird nicht mehr gespeichert. */
export interface NeuerBenutzer { id: string; email: string; name: string; passwortHash: string | null; verwaltung?: string[] }
export interface Link { benutzerId: string; zweck: Zweck; ablauf: Date; benutzt: Date | null }
export interface SitzungsInfo {
  geraet: string; ip: string; vertretungId?: string | null;
  /** Anmeldung mit allen eingerichteten Faktoren (#819): zählt für „Anmeldung höchstens 10 Minuten her“. */
  voll?: boolean;
}
/** Verwaltungsmodus einer Sitzung (#819), auf dem Server gehalten – nie ein Merkmal, das der Browser setzt. */
export interface SitzungsVerwaltung {
  /** Beginn des laufenden Modus; null = kein Modus. */
  verwaltungSeit: Date | null;
  /** Letzte Aktivität im Modus. */
  verwaltungAktiv: Date | null;
  /** Tagesmerker: zuletzt erneut angemeldet (gilt bis Mitternacht). */
  verwaltungBestaetigt: Date | null;
  /** Letzte frische Anmeldung für heikle Handlungen. */
  frisch: Date | null;
}
export interface SitzungIntern extends Partial<SitzungsVerwaltung> {
  id: string; benutzerId: string; ablauf: Date; zuletztAktiv: Date; vertretungId: string | null;
  /** Beginn der Sitzung (#416: Zwei-Faktor-Pflicht erst für neue Sitzungen). */ erstellt?: Date;
  /** Zeitpunkt der Anmeldung mit allen Faktoren (#819); null bei vertretenen oder übernommenen Sitzungen. */
  anmeldungVoll?: Date | null;
}
/** Änderung, die nur gilt, wenn die Prüfung über alle Personen (in einer Sperre) nichts einzuwenden hat (#818). */
export type Schutzpruefung = (nachher: Benutzer[], vorher: Benutzer[]) => string | null;

/** Datenzugriff für Benutzer, Sitzungen und Passwort-Links. */
export interface KontoRepo {
  anzahlBenutzer(): Promise<number>;
  listeBenutzer(): Promise<Benutzer[]>;
  holeBenutzer(id: string): Promise<Benutzer | undefined>;
  holeHash(email: string): Promise<{ benutzer: Benutzer; hash: string | null } | undefined>;
  legeBenutzerAn(b: NeuerBenutzer): Promise<Benutzer>;
  aendereBenutzer(id: string, d: Partial<Pick<Benutzer, 'name' | 'aktiv' | 'email' | 'entwicklermodus' | 'sprache' | 'uebersetzen'>>): Promise<Benutzer>;
  /**
   * Verwaltungsrecht setzen oder (de)aktivieren mit Schutzregel (#818): in einer Transaktion mit Sperre über alle
   * Personen; liefert die Prüfung einen Grund, ändert sich nichts und er kommt als Fehler zurück.
   */
  aendereGeschuetzt(id: string, d: { verwaltung?: string[]; aktiv?: boolean }, pruefe: Schutzpruefung): Promise<{ benutzer: Benutzer } | { grund: string }>;
  /** Abwesenheit mit Vertreter setzen (#78). */
  setzeAbwesenheit(id: string, a: Abwesenheit): Promise<Benutzer>;
  setzeHash(id: string, hash: string): Promise<void>;
  notiereAnmeldung(id: string): Promise<void>;
  loescheBenutzer(id: string): Promise<void>;
  /** Dienstkonto eines Pakets (#338); nicht in listeBenutzer, anzahlBenutzer, holeHash. */
  dienstkonto(paketId: string): Promise<Benutzer | undefined>;
  legeDienstkontoAn(d: { id: string; paketId: string; name: string }): Promise<Benutzer>;
  listeDienstkonten(): Promise<Benutzer[]>;
  /** Systemkonten des DMS (#673), z. B. „Automatisierung“; wie Dienstkonten nicht in listeBenutzer, anzahlBenutzer, holeHash. */
  systemkonto(kennung: string): Promise<Benutzer | undefined>;
  legeSystemkontoAn(d: { id: string; kennung: string; name: string }): Promise<Benutzer>;
  listeSystemkonten(): Promise<Benutzer[]>;

  legeSitzungAn(hash: string, benutzerId: string, ablauf: Date, info: SitzungsInfo): Promise<void>;
  holeSitzung(hash: string): Promise<SitzungIntern | undefined>;
  /**
   * Sitzung und Person in **einer** Abfrage (#741): nur eine noch gültige Sitzung einer aktiven Person (kein
   * Systemkonto), sonst undefined. Nie aus einem Zwischenspeicher. Liest den Haushaltsstand für die Anfrage mit.
   */
  holeAnmeldung?(hash: string): Promise<{ sitzung: SitzungIntern; benutzer: Benutzer } | undefined>;
  /** Letzte Aktivität auf jetzt setzen. */
  beruehreSitzung(hash: string): Promise<void>;
  /** Verwaltungsmodus der Sitzung ändern (#819); nur die angegebenen Felder. */
  setzeSitzungsVerwaltung(hash: string, d: Partial<SitzungsVerwaltung>): Promise<void>;
  /** Modus, Tagesmerker und frische Anmeldung in allen Sitzungen des Benutzers aufheben (#819: Rechteentzug, Zwei-Faktor). */
  vergissVerwaltungVon(benutzerId: string): Promise<void>;
  /**
   * Werkbank (#921): gültige Sitzungen mit begonnenem Verwaltungsmodus, nur von aktiven Personen dieses Haushalts (keine
   * Dienst- oder Systemkonten) und nicht in einer Vertretung. Ob der Modus noch läuft, prüft `Konten.modusAktiv`.
   */
  sitzungenImVerwaltungsmodus(): Promise<Array<{ benutzer: Benutzer; sitzung: SitzungIntern }>>;
  /** Gültige Sitzungen eines Benutzers, neueste Aktivität zuerst. */
  listeSitzungen(benutzerId: string): Promise<Array<Sitzung & { hash: string }>>;
  loescheSitzung(hash: string): Promise<void>;
  loescheSitzungMitId(benutzerId: string, id: string): Promise<boolean>;
  loescheSitzungenVon(benutzerId: string): Promise<void>;

  legeVertretungAn(v: { id: string; benutzerId: string; adminId: string; adminName: string }): Promise<void>;
  beendeVertretung(id: string): Promise<void>;
  holeVertretung(id: string): Promise<Vertretung | undefined>;
  /** Vertretungen, die der Benutzer noch nicht gesehen hat. */
  ungeseheneVertretungen(benutzerId: string): Promise<Vertretung[]>;
  /** Vollexport (#254): alle Vertretungen. */
  alleVertretungen(): Promise<Vertretung[]>;
  markiereGesehen(benutzerId: string): Promise<void>;

  /** Persönliche Einstellungen (Sortierung, Design …). */
  einstellungen(benutzerId: string): Promise<Record<string, unknown>>;
  /** wert null löscht die Einstellung. */
  setzeEinstellung(benutzerId: string, schluessel: string, wert: unknown): Promise<void>;
  /**
   * „Zuletzt geöffnet“ (#334): die Mappe vorn in die Liste unter `schluessel` (höchstens `max`, ohne Doppelte).
   * Seit #940 je Eintrag `{ id, am }` (Zeitpunkt für die Liste der letzten 25); ältere Einträge sind nur die Id.
   * Steht sie schon vorn und ist der Zeitpunkt jünger als eine Minute, bleibt alles. In einem Zugriff (#615) und ohne
   * auf die Platte zu warten.
   */
  merkeVorn(benutzerId: string, schluessel: string, mappeId: string, max: number): Promise<void>;

  legeLinkAn(hash: string, benutzerId: string, zweck: Zweck, ablauf: Date): Promise<void>;
  holeLink(hash: string): Promise<Link | undefined>;
  /** Markiert den Link als benutzt; false, wenn er schon benutzt war. */
  verbraucheLink(hash: string): Promise<boolean>;
  loescheLinksVon(benutzerId: string): Promise<void>;

  /** Notfallcode vom Notfallblatt (#815): nur der Hash; null = keiner (noch kein Blatt oder schon benutzt). */
  notfallcode(): Promise<{ hash: string; erstellt: Date } | null>;
  setzeNotfallcode(hash: string | null): Promise<void>;
  /**
   * Notfallcode einlösen (#815), alles in einer Transaktion: nur wenn noch genau dieser Hash gilt, Code ungültig machen,
   * Passwort setzen, alle Sitzungen und Passwort-Links der Person löschen. false = inzwischen benutzt oder ersetzt –
   * bei zwei gleichzeitigen Anfragen mit demselben Code gewinnt nur eine.
   */
  loeseNotfallcodeEin(erwartet: string, benutzerId: string, passwortHash: string): Promise<boolean>;
}

/* ---------------- Arbeitsspeicher (Tests) ---------------- */

export function speicherKontoRepo(): KontoRepo {
  const benutzer = new Map<string, Benutzer & { hash: string | null }>();
  const sitzungen = new Map<string, SitzungIntern & { erstellt: Date; geraet: string; ip: string }>();
  const OHNE_MODUS: SitzungsVerwaltung = { verwaltungSeit: null, verwaltungAktiv: null, verwaltungBestaetigt: null, frisch: null };
  const vertretungen = new Map<string, Vertretung & { gesehen: Date | null }>();
  const einstellungen = new Map<string, Record<string, unknown>>();
  const links = new Map<string, Link>();
  let notfall: { hash: string; erstellt: Date } | null = null;
  const ohneHash = ({ hash: _h, ...b }: Benutzer & { hash: string | null }): Benutzer => ({ ...b, hatPasswort: !!_h });

  return {
    async anzahlBenutzer() { return [...benutzer.values()].filter((b) => !b.art).length; },
    async listeBenutzer() {
      const zuletzt = (id: string) => {
        const t = [...sitzungen.values()].filter((x) => x.benutzerId === id && x.ablauf.getTime() > Date.now()).map((x) => x.zuletztAktiv.getTime());
        return t.length ? new Date(Math.max(...t)).toISOString() : null;
      };
      return [...benutzer.values()].filter((b) => !b.art).map((b) => ({ ...ohneHash(b), zuletztAktiv: zuletzt(b.id) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async holeBenutzer(id) { const b = benutzer.get(id); return b && ohneHash(b); },
    async holeHash(email) {
      const b = [...benutzer.values()].find((x) => !x.art && x.email.toLowerCase() === email.toLowerCase());
      return b && { benutzer: ohneHash(b), hash: b.hash };
    },
    async dienstkonto(paketId) { const b = [...benutzer.values()].find((x) => x.art === 'dienst' && x.paketId === paketId); return b && ohneHash(b); },
    async legeDienstkontoAn(d) {
      const b = { id: d.id, email: dienstEmail(d.paketId, 'speicher'), name: d.name, rolle: 'mitglied' as Rolle, verwaltung: [], aktiv: true, hatPasswort: false, erstellt: new Date().toISOString(), letzteAnmeldung: null, entwicklermodus: false, hash: null, abwesenheit: { ...KEINE_ABWESENHEIT }, deaktiviert: null, art: 'dienst' as const, paketId: d.paketId };
      benutzer.set(d.id, b);
      return ohneHash(b);
    },
    async listeDienstkonten() { return [...benutzer.values()].filter((b) => b.art === 'dienst').map(ohneHash); },
    async systemkonto(kennung) { const b = [...benutzer.values()].find((x) => x.art === 'system' && x.systemkonto === kennung); return b && ohneHash(b); },
    async legeSystemkontoAn(d) {
      const da = [...benutzer.values()].find((x) => x.art === 'system' && x.systemkonto === d.kennung);
      if (da) return ohneHash(da);
      const b = { id: d.id, email: systemEmail(d.kennung, 'speicher'), name: d.name, rolle: 'mitglied' as Rolle, verwaltung: [], aktiv: true, hatPasswort: false, erstellt: new Date().toISOString(), letzteAnmeldung: null, entwicklermodus: false, hash: null, abwesenheit: { ...KEINE_ABWESENHEIT }, deaktiviert: null, art: 'system' as const, systemkonto: d.kennung };
      benutzer.set(b.id, b);
      return ohneHash(b);
    },
    async listeSystemkonten() { return [...benutzer.values()].filter((b) => b.art === 'system').map(ohneHash); },
    async legeBenutzerAn(n) {
      if ([...benutzer.values()].some((x) => x.email.toLowerCase() === n.email.toLowerCase())) throw Object.assign(new Error('doppelt'), { code: '23505' });
      const b = { id: n.id, email: n.email, name: n.name, rolle: 'mitglied' as Rolle, verwaltung: [...(n.verwaltung ?? [])], aktiv: true, hatPasswort: !!n.passwortHash, erstellt: new Date().toISOString(), letzteAnmeldung: null, entwicklermodus: false, sprache: null, hash: n.passwortHash, abwesenheit: { ...KEINE_ABWESENHEIT }, deaktiviert: null };
      benutzer.set(n.id, b);
      return ohneHash(b);
    },
    async aendereBenutzer(id, d) {
      const alt = benutzer.get(id)!;
      const deaktiviert = d.aktiv === undefined ? alt.deaktiviert ?? null : d.aktiv ? null : alt.aktiv ? new Date().toISOString() : alt.deaktiviert ?? null;
      const b = { ...alt, ...d, deaktiviert }; benutzer.set(id, b); return ohneHash(b);
    },
    async aendereGeschuetzt(id, d, pruefe) {
      // Ohne await zwischen Prüfen und Ändern: im Arbeitsspeicher ist das schon eine Einheit.
      const alt = benutzer.get(id)!;
      const neu = { ...alt, ...(d.verwaltung ? { verwaltung: [...d.verwaltung] } : {}), ...(d.aktiv !== undefined ? { aktiv: d.aktiv } : {}) };
      const vorher = [...benutzer.values()].filter((b) => !b.art).map(ohneHash);
      const alle = [...benutzer.values()].filter((b) => !b.art).map((b) => ohneHash(b.id === id ? neu : b));
      const grund = pruefe(alle, vorher);
      if (grund) return { grund };
      const deaktiviert = d.aktiv === undefined ? alt.deaktiviert ?? null : d.aktiv ? null : alt.aktiv ? new Date().toISOString() : alt.deaktiviert ?? null;
      benutzer.set(id, { ...neu, deaktiviert });
      return { benutzer: ohneHash({ ...neu, deaktiviert }) };
    },
    async setzeAbwesenheit(id, a) { const b = { ...benutzer.get(id)!, abwesenheit: { ...a } }; benutzer.set(id, b); return ohneHash(b); },
    async setzeHash(id, hash) { benutzer.get(id)!.hash = hash; },
    async notiereAnmeldung(id) { benutzer.get(id)!.letzteAnmeldung = new Date().toISOString(); },
    async loescheBenutzer(id) {
      benutzer.delete(id);
      for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k);
      for (const [k, l] of links) if (l.benutzerId === id) links.delete(k);
    },
    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      sitzungen.set(hash, { id: randomUUID(), benutzerId, ablauf, zuletztAktiv: new Date(), erstellt: new Date(), geraet: info.geraet, ip: info.ip, vertretungId: info.vertretungId ?? null, anmeldungVoll: info.voll ? new Date() : null, ...OHNE_MODUS });
    },
    async holeSitzung(hash) { const x = sitzungen.get(hash); return x && { ...x }; },
    async holeAnmeldung(hash) {
      const x = sitzungen.get(hash);
      const b = x && x.ablauf.getTime() > Date.now() ? benutzer.get(x.benutzerId) : undefined;
      return x && b && b.aktiv && b.art !== 'system' ? { sitzung: { ...x }, benutzer: ohneHash(b) } : undefined;
    },
    async beruehreSitzung(hash) { const x = sitzungen.get(hash); if (x) x.zuletztAktiv = new Date(); },
    async sitzungenImVerwaltungsmodus() {
      return [...sitzungen.values()].flatMap((x) => {
        const b = benutzer.get(x.benutzerId);
        if (!b || b.art || !b.aktiv || !x.verwaltungSeit || x.vertretungId || x.ablauf.getTime() <= Date.now()) return [];
        return [{ benutzer: ohneHash(b), sitzung: { ...x } }];
      });
    },
    async setzeSitzungsVerwaltung(hash, d) { const x = sitzungen.get(hash); if (x) Object.assign(x, d); },
    async vergissVerwaltungVon(id) { for (const x of sitzungen.values()) if (x.benutzerId === id) Object.assign(x, OHNE_MODUS); },
    async listeSitzungen(benutzerId) {
      return [...sitzungen].filter(([, x]) => x.benutzerId === benutzerId && x.ablauf.getTime() > Date.now())
        .map(([hash, x]) => ({ hash, id: x.id, benutzerId, erstellt: x.erstellt.toISOString(), zuletztAktiv: x.zuletztAktiv.toISOString(), ablauf: x.ablauf.toISOString(), geraet: x.geraet, ip: x.ip, vertretungId: x.vertretungId }))
        .sort((a, b) => b.zuletztAktiv.localeCompare(a.zuletztAktiv));
    },
    async loescheSitzung(hash) { sitzungen.delete(hash); },
    async loescheSitzungMitId(benutzerId, id) {
      for (const [k, x] of sitzungen) if (x.id === id && x.benutzerId === benutzerId) { sitzungen.delete(k); return true; }
      return false;
    },
    async legeVertretungAn(v) { vertretungen.set(v.id, { ...v, beginn: new Date().toISOString(), ende: null, gesehen: null }); },
    async beendeVertretung(id) { const v = vertretungen.get(id); if (v && !v.ende) v.ende = new Date().toISOString(); },
    async holeVertretung(id) { const v = vertretungen.get(id); return v && { id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende }; },
    async ungeseheneVertretungen(benutzerId) {
      return [...vertretungen.values()].filter((v) => v.benutzerId === benutzerId && !v.gesehen)
        .map((v) => ({ id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende }));
    },
    async alleVertretungen() { return [...vertretungen.values()].map((v) => ({ id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende })); },
    async markiereGesehen(benutzerId) { for (const v of vertretungen.values()) if (v.benutzerId === benutzerId && !v.gesehen) v.gesehen = new Date(); },
    async einstellungen(id) { return structuredClone(einstellungen.get(id) ?? {}); },
    async setzeEinstellung(id, k, w) {
      const e = einstellungen.get(id) ?? {};
      if (w === null) delete e[k]; else e[k] = structuredClone(w);
      einstellungen.set(id, e);
    },
    async merkeVorn(id, k, mappeId, max) {
      const e = einstellungen.get(id) ?? {};
      const liste = zuletztListe(e[k]);
      if (liste[0]?.id === mappeId && liste[0].am && Date.now() - Date.parse(liste[0].am) < ZULETZT_RUHE_MS) return;
      e[k] = [{ id: mappeId, am: new Date().toISOString() }, ...liste.filter((x) => x.id !== mappeId).map((x) => (x.am ? x : x.id))].slice(0, max);
      einstellungen.set(id, e);
    },
    async loescheSitzungenVon(id) { for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k); },
    async legeLinkAn(hash, benutzerId, zweck, ablauf) { links.set(hash, { benutzerId, zweck, ablauf, benutzt: null }); },
    async holeLink(hash) { return links.get(hash); },
    async verbraucheLink(hash) { const l = links.get(hash); if (!l || l.benutzt) return false; l.benutzt = new Date(); return true; },
    async loescheLinksVon(id) { for (const [k, l] of links) if (l.benutzerId === id) links.delete(k); },
    async notfallcode() { return notfall && { ...notfall }; },
    async setzeNotfallcode(hash) { notfall = hash ? { hash, erstellt: new Date() } : null; },
    async loeseNotfallcodeEin(erwartet, benutzerId, passwortHash) {
      // Ohne await zwischen Prüfen und Ändern: im Arbeitsspeicher ist das schon eine Einheit.
      const b = benutzer.get(benutzerId);
      if (!notfall || notfall.hash !== erwartet || !b) return false;
      notfall = null;
      b.hash = passwortHash;
      for (const [k, x] of sitzungen) if (x.benutzerId === benutzerId) sitzungen.delete(k);
      for (const [k, l] of links) if (l.benutzerId === benutzerId) links.delete(k);
      return true;
    },
  };
}

/* ---------------- PostgreSQL ---------------- */

type Zeile = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const alsBenutzer = (r: Zeile): Benutzer => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  // Gespeichert ist keine Rolle mehr (#818); `admin` setzt nur der Verwaltungsmodus einer Anfrage.
  rolle: 'mitglied',
  verwaltung: Array.isArray(r.verwaltung) ? (r.verwaltung as string[]) : [],
  aktiv: r.aktiv as boolean,
  hatPasswort: r.passwort_hash != null,
  erstellt: iso(r.erstellt)!,
  letzteAnmeldung: iso(r.letzte_anmeldung),
  entwicklermodus: !!r.entwicklermodus,
  sprache: (r.sprache as string | null | undefined) ?? null,
  // Übersetzen (#732): nur, wenn die Person es für sich abgeschaltet hat – sonst gilt die Vorgabe „an“.
  ...(r.uebersetzen === false ? { uebersetzen: false } : {}),
  abwesenheit: { an: !!r.abwesend, von: tag(r.abwesend_von), bis: tag(r.abwesend_bis), vertreterId: (r.vertreter_id as string | null) ?? null },
  deaktiviert: iso(r.deaktiviert),
  ...(r.art === 'dienst' ? { art: 'dienst' as const, paketId: r.paket_id as string } : {}),
  ...(r.art === 'system' ? { art: 'system' as const, systemkonto: r.systemkonto as string } : {}),
});
/** date-Spalte als JJJJ-MM-TT (ohne Zeitzonenverschiebung). */
const tag = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};

const zeitOderNull = (v: unknown) => (v ? new Date(v as string) : null);
const alsSitzung = (r: Zeile): SitzungIntern => ({
  id: r.id as string, benutzerId: r.benutzer_id as string, ablauf: new Date(r.ablauf as string),
  zuletztAktiv: new Date(r.zuletzt_aktiv as string), vertretungId: (r.vertretung_id as string | null) ?? null,
  erstellt: r.erstellt ? new Date(r.erstellt as string) : undefined,
  anmeldungVoll: zeitOderNull(r.anmeldung_voll), verwaltungSeit: zeitOderNull(r.verwaltung_seit), verwaltungAktiv: zeitOderNull(r.verwaltung_aktiv),
  verwaltungBestaetigt: zeitOderNull(r.verwaltung_bestaetigt), frisch: zeitOderNull(r.frisch),
});

const alsVertretung = (r: Zeile): Vertretung => ({
  id: r.id as string, benutzerId: r.benutzer_id as string, adminId: (r.admin_id as string | null) ?? null,
  adminName: r.admin_name as string, beginn: iso(r.beginn)!, ende: iso(r.ende),
});

export function pgKontoRepo(sql: postgres.Sql, haushaltId: string): KontoRepo {
  return {
    async anzahlBenutzer() {
      const [r] = await sql`SELECT count(*)::int AS n FROM benutzer WHERE art = 'person'`;
      return r.n as number;
    },
    async listeBenutzer() {
      const r = await sql`
        SELECT b.*, (SELECT max(s.zuletzt_aktiv) FROM sitzungen s WHERE s.benutzer_id = b.id AND s.ablauf > now()) AS zuletzt_aktiv
        FROM benutzer b WHERE b.haushalt_id = ${haushaltId} AND b.art = 'person' ORDER BY lower(b.name), lower(b.email)`;
      return r.map((z) => ({ ...alsBenutzer(z), zuletztAktiv: iso(z.zuletzt_aktiv) }));
    },
    async holeBenutzer(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async holeHash(email) {
      const [r] = await sql`SELECT * FROM benutzer WHERE lower(email) = lower(${email}) AND haushalt_id = ${haushaltId} AND art = 'person'`;
      return r ? { benutzer: alsBenutzer(r), hash: (r.passwort_hash as string | null) ?? null } : undefined;
    },
    async dienstkonto(paketId) {
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'dienst' AND paket_id = ${paketId}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async legeDienstkontoAn(d) {
      const [r] = await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, art, paket_id)
        VALUES (${d.id}, ${haushaltId}, ${dienstEmail(d.paketId, haushaltId)}, ${d.name}, 'mitglied', NULL, 'dienst', ${d.paketId})
        RETURNING *`;
      return alsBenutzer(r);
    },
    async listeDienstkonten() { return (await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'dienst' ORDER BY paket_id`).map(alsBenutzer); },
    async systemkonto(kennung) {
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' AND systemkonto = ${kennung}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async legeSystemkontoAn(d) {
      // Gleichzeitiger Start zweier Server: der eindeutige Index entscheidet, beide bekommen dasselbe Konto.
      await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, art, systemkonto)
        VALUES (${d.id}, ${haushaltId}, ${systemEmail(d.kennung, haushaltId)}, ${d.name}, 'mitglied', NULL, 'system', ${d.kennung})
        ON CONFLICT DO NOTHING`;
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' AND systemkonto = ${d.kennung}`;
      return alsBenutzer(r);
    },
    async listeSystemkonten() { return (await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' ORDER BY systemkonto`).map(alsBenutzer); },
    async legeBenutzerAn(n) {
      const [r] = await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, verwaltung)
        VALUES (${n.id}, ${haushaltId}, ${n.email}, ${n.name}, 'mitglied', ${n.passwortHash}, ${n.verwaltung ?? []}::text[])
        RETURNING *`;
      return alsBenutzer(r);
    },
    async aendereBenutzer(id, d) {
      const [r] = await sql`
        UPDATE benutzer SET
          name = coalesce(${d.name ?? null}, name),
          email = coalesce(${d.email ?? null}, email),
          aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv),
          entwicklermodus = coalesce(${d.entwicklermodus ?? null}::boolean, entwicklermodus),
          uebersetzen = coalesce(${d.uebersetzen ?? null}::boolean, uebersetzen),
          sprache = CASE WHEN ${d.sprache !== undefined}::boolean THEN ${d.sprache ?? null}::text ELSE sprache END,
          deaktiviert = CASE WHEN ${d.aktiv ?? null}::boolean IS NULL THEN deaktiviert
            WHEN ${d.aktiv ?? null}::boolean THEN NULL WHEN aktiv THEN now() ELSE deaktiviert END
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async aendereGeschuetzt(id, d, pruefe) {
      return sql.begin(async (tx) => {
        // Sperre über alle Personen der Ablage (#818, Bauvorgabe Sicherheit): Zwei Verwaltende, die sich gleichzeitig
        // gegenseitig das Recht nehmen, landen so nicht bei null – die zweite Prüfung sieht die erste Änderung.
        const zeilen = await tx`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'person' ORDER BY id FOR UPDATE`;
        const vorher = zeilen.map(alsBenutzer);
        const alle = vorher.map((b) => (b.id !== id ? b : { ...b, ...(d.verwaltung ? { verwaltung: d.verwaltung } : {}), ...(d.aktiv !== undefined ? { aktiv: d.aktiv } : {}) }));
        const grund = pruefe(alle, vorher);
        if (grund) return { grund };
        const [r] = await tx`
          UPDATE benutzer SET
            verwaltung = coalesce(${d.verwaltung ?? null}::text[], verwaltung),
            aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv),
            deaktiviert = CASE WHEN ${d.aktiv ?? null}::boolean IS NULL THEN deaktiviert
              WHEN ${d.aktiv ?? null}::boolean THEN NULL WHEN aktiv THEN now() ELSE deaktiviert END
          WHERE id = ${id} AND haushalt_id = ${haushaltId}
          RETURNING *`;
        return { benutzer: alsBenutzer(r) };
      }) as Promise<{ benutzer: Benutzer } | { grund: string }>;
    },
    async setzeAbwesenheit(id, a) {
      const [r] = await sql`
        UPDATE benutzer SET abwesend = ${a.an}, abwesend_von = ${a.von}::date, abwesend_bis = ${a.bis}::date,
          vertreter_id = ${istUuid(a.vertreterId) ? a.vertreterId : null}::uuid
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async setzeHash(id, hash) { await sql`UPDATE benutzer SET passwort_hash = ${hash} WHERE id = ${id}`; },
    async notiereAnmeldung(id) { await sql`UPDATE benutzer SET letzte_anmeldung = now() WHERE id = ${id}`; },
    async loescheBenutzer(id) { await sql`DELETE FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`; },

    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      await sql`
        INSERT INTO sitzungen (schluessel_hash, benutzer_id, ablauf, geraet, ip, vertretung_id, anmeldung_voll)
        VALUES (${hash}, ${benutzerId}, ${ablauf}, ${info.geraet.slice(0, 400)}, ${info.ip.slice(0, 64)}, ${info.vertretungId ?? null}, ${info.voll ? new Date() : null})`;
      // Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
      await sql`DELETE FROM sitzungen WHERE ablauf < now()`;
    },
    async holeSitzung(hash) {
      const [r] = await sql`SELECT id, benutzer_id, ablauf, zuletzt_aktiv, vertretung_id, erstellt, anmeldung_voll, verwaltung_seit, verwaltung_aktiv, verwaltung_bestaetigt, frisch FROM sitzungen WHERE schluessel_hash = ${hash}`;
      return r ? alsSitzung(r) : undefined;
    },
    async holeAnmeldung(hash) {
      // Gültigkeit der Sitzung, Haushalt, „aktiv“ und Art der Person in derselben Abfrage (Bedingung Sicherheit, #747);
      // dazu der Haushaltsstand für die Zwischenspeicher dieser Anfrage (#741).
      const [r] = await sql`
        SELECT b.*, s.id AS s_id, s.benutzer_id AS s_benutzer_id, s.ablauf AS s_ablauf, s.zuletzt_aktiv AS s_zuletzt_aktiv,
          s.vertretung_id AS s_vertretung_id, s.erstellt AS s_erstellt, s.anmeldung_voll AS s_anmeldung_voll,
          s.verwaltung_seit AS s_verwaltung_seit, s.verwaltung_aktiv AS s_verwaltung_aktiv,
          s.verwaltung_bestaetigt AS s_verwaltung_bestaetigt, s.frisch AS s_frisch, ${standSpalten(sql, haushaltId)}
        FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id AND b.haushalt_id = ${haushaltId}
        WHERE s.schluessel_hash = ${hash} AND s.ablauf > now() AND b.aktiv AND b.art IS DISTINCT FROM 'system'`;
      if (!r) return undefined;
      staendeAusZeile(sql, haushaltId, r);
      const s = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('s_')).map(([k, v]) => [k.slice(2), v]));
      return { sitzung: alsSitzung(s), benutzer: alsBenutzer(r) };
    },
    async beruehreSitzung(hash) { await sql`UPDATE sitzungen SET zuletzt_aktiv = now() WHERE schluessel_hash = ${hash}`; },
    async sitzungenImVerwaltungsmodus() {
      // Wenige Zeilen (nur Sitzungen mit Modus); keine Historie – gelesen wird nur der Zustand der Sitzungen.
      const r = await sql`
        SELECT b.*, s.id AS s_id, s.benutzer_id AS s_benutzer_id, s.ablauf AS s_ablauf, s.zuletzt_aktiv AS s_zuletzt_aktiv,
          s.vertretung_id AS s_vertretung_id, s.verwaltung_seit AS s_verwaltung_seit, s.verwaltung_aktiv AS s_verwaltung_aktiv
        FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id AND b.haushalt_id = ${haushaltId}
        WHERE s.verwaltung_seit IS NOT NULL AND s.vertretung_id IS NULL AND s.ablauf > now() AND b.aktiv AND b.art = 'person'`;
      return r.map((z) => {
        const s = Object.fromEntries(Object.entries(z).filter(([k]) => k.startsWith('s_')).map(([k, v]) => [k.slice(2), v]));
        return { benutzer: alsBenutzer(z), sitzung: alsSitzung(s) };
      });
    },
    async setzeSitzungsVerwaltung(hash, d) {
      const setze = (k: keyof SitzungsVerwaltung) => k in d;
      await sql`
        UPDATE sitzungen SET
          verwaltung_seit = CASE WHEN ${setze('verwaltungSeit')} THEN ${d.verwaltungSeit ?? null}::timestamptz ELSE verwaltung_seit END,
          verwaltung_aktiv = CASE WHEN ${setze('verwaltungAktiv')} THEN ${d.verwaltungAktiv ?? null}::timestamptz ELSE verwaltung_aktiv END,
          verwaltung_bestaetigt = CASE WHEN ${setze('verwaltungBestaetigt')} THEN ${d.verwaltungBestaetigt ?? null}::timestamptz ELSE verwaltung_bestaetigt END,
          frisch = CASE WHEN ${setze('frisch')} THEN ${d.frisch ?? null}::timestamptz ELSE frisch END
        WHERE schluessel_hash = ${hash}`;
    },
    async vergissVerwaltungVon(id) {
      if (!istUuid(id)) return;
      await sql`UPDATE sitzungen SET verwaltung_seit = NULL, verwaltung_aktiv = NULL, verwaltung_bestaetigt = NULL, frisch = NULL WHERE benutzer_id = ${id}`;
    },
    async listeSitzungen(benutzerId) {
      if (!istUuid(benutzerId)) return [];
      const r = await sql`SELECT * FROM sitzungen WHERE benutzer_id = ${benutzerId} AND ablauf > now() ORDER BY zuletzt_aktiv DESC`;
      return r.map((z) => ({
        hash: z.schluessel_hash as string, id: z.id as string, benutzerId, erstellt: iso(z.erstellt)!, zuletztAktiv: iso(z.zuletzt_aktiv)!,
        ablauf: iso(z.ablauf)!, geraet: z.geraet as string, ip: z.ip as string, vertretungId: (z.vertretung_id as string | null) ?? null,
      }));
    },
    async loescheSitzung(hash) { await sql`DELETE FROM sitzungen WHERE schluessel_hash = ${hash}`; },
    async loescheSitzungMitId(benutzerId, id) {
      if (!istUuid(id) || !istUuid(benutzerId)) return false;
      return (await sql`DELETE FROM sitzungen WHERE id = ${id} AND benutzer_id = ${benutzerId} RETURNING 1`).length === 1;
    },
    async legeVertretungAn(v) {
      await sql`INSERT INTO vertretungen (id, benutzer_id, admin_id, admin_name) VALUES (${v.id}, ${v.benutzerId}, ${v.adminId}, ${v.adminName})`;
    },
    async beendeVertretung(id) { await sql`UPDATE vertretungen SET ende = now() WHERE id = ${id} AND ende IS NULL`; },
    async holeVertretung(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM vertretungen WHERE id = ${id}`;
      return r ? alsVertretung(r) : undefined;
    },
    async ungeseheneVertretungen(benutzerId) {
      return (await sql`SELECT * FROM vertretungen WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL ORDER BY beginn`).map(alsVertretung);
    },
    async alleVertretungen() {
      return (await sql`SELECT v.* FROM vertretungen v JOIN benutzer b ON b.id = v.benutzer_id WHERE b.haushalt_id = ${haushaltId} ORDER BY v.beginn`).map(alsVertretung);
    },
    async markiereGesehen(benutzerId) { await sql`UPDATE vertretungen SET gesehen = now() WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL`; },
    async einstellungen(id) {
      if (!istUuid(id)) return {};
      const r = await sql`SELECT schluessel, wert FROM benutzer_einstellungen WHERE benutzer_id = ${id}`;
      return Object.fromEntries(r.map((z) => [z.schluessel as string, z.wert]));
    },
    async setzeEinstellung(id, k, w) {
      if (w === null) { await sql`DELETE FROM benutzer_einstellungen WHERE benutzer_id = ${id} AND schluessel = ${k}`; return; }
      await sql`
        INSERT INTO benutzer_einstellungen (benutzer_id, schluessel, wert) VALUES (${id}, ${k}, ${sql.json(w as postgres.JSONValue)})
        ON CONFLICT (benutzer_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
    async merkeVorn(id, k, mappeId, max) {
      if (!istUuid(id)) return;
      // Ein Merkposten: Geht er bei einem Absturz verloren, fehlt nur ein Eintrag unter „Zuletzt geöffnet“. Ohne
      // Warten auf die Platte (ohneWarten) hält das Schreiben die Zeile kürzer – unter Last (#615) warteten sonst alle
      // Anfragen desselben Benutzers auf die Sperre.
      // Einträge: `{ id, am }` (#940) oder – von früher – nur die Id als Text.
      const am = new Date().toISOString();
      await sql`
        INSERT INTO benutzer_einstellungen AS b (benutzer_id, schluessel, wert)
        SELECT ${id}::uuid, ${k}::text, jsonb_build_array(jsonb_build_object('id', ${mappeId}::text, 'am', ${am}::text)) FROM ${ohneWarten(sql)}
        ON CONFLICT (benutzer_id, schluessel) DO UPDATE SET wert = (
          SELECT jsonb_agg(x.e ORDER BY x.n) FROM (
            SELECT jsonb_build_object('id', ${mappeId}::text, 'am', ${am}::text) AS e, 0::bigint AS n
            UNION ALL
            (SELECT e, n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.wert) = 'array' THEN b.wert ELSE '[]'::jsonb END) WITH ORDINALITY AS t(e, n)
              WHERE (jsonb_typeof(e) = 'string' AND e #>> '{}' <> ${mappeId}::text)
                 OR (jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'id') = 'string' AND e ->> 'id' <> ${mappeId}::text)
              ORDER BY n LIMIT ${max - 1})) x)
        WHERE NOT (jsonb_typeof(b.wert -> 0) = 'object' AND b.wert -> 0 ->> 'id' = ${mappeId}::text
          AND jsonb_typeof(b.wert -> 0 -> 'am') = 'string' AND (b.wert -> 0 ->> 'am')::timestamptz > ${am}::timestamptz - make_interval(secs => ${ZULETZT_RUHE_MS / 1000}))`;
    },
    async loescheSitzungenVon(id) { await sql`DELETE FROM sitzungen WHERE benutzer_id = ${id}`; },

    async legeLinkAn(hash, benutzerId, zweck, ablauf) {
      await sql`INSERT INTO passwort_links (schluessel_hash, benutzer_id, zweck, ablauf) VALUES (${hash}, ${benutzerId}, ${zweck}, ${ablauf})`;
    },
    async holeLink(hash) {
      const [r] = await sql`SELECT * FROM passwort_links WHERE schluessel_hash = ${hash}`;
      return r ? { benutzerId: r.benutzer_id as string, zweck: r.zweck as Zweck, ablauf: new Date(r.ablauf as string), benutzt: r.benutzt ? new Date(r.benutzt as string) : null } : undefined;
    },
    async verbraucheLink(hash) {
      const r = await sql`UPDATE passwort_links SET benutzt = now() WHERE schluessel_hash = ${hash} AND benutzt IS NULL RETURNING 1`;
      return r.length === 1;
    },
    async loescheLinksVon(id) { await sql`DELETE FROM passwort_links WHERE benutzer_id = ${id}`; },

    async notfallcode() {
      const [r] = await sql`SELECT hash, erstellt FROM notfallcode WHERE haushalt_id = ${haushaltId} AND hash IS NOT NULL`;
      return r ? { hash: r.hash as string, erstellt: new Date(r.erstellt as string) } : null;
    },
    async setzeNotfallcode(hash) {
      await sql`
        INSERT INTO notfallcode (haushalt_id, hash, erstellt) VALUES (${haushaltId}, ${hash}, now())
        ON CONFLICT (haushalt_id) DO UPDATE SET hash = EXCLUDED.hash, erstellt = EXCLUDED.erstellt`;
    },
    async loeseNotfallcodeEin(erwartet, benutzerId, passwortHash) {
      if (!istUuid(benutzerId)) return false;
      return sql.begin(async (tx) => {
        // Sperre auf die Zeile des Codes: Eine zweite Anfrage mit demselben Code wartet hier und sieht danach keinen mehr.
        const [r] = await tx`SELECT hash FROM notfallcode WHERE haushalt_id = ${haushaltId} FOR UPDATE`;
        if (!r || r.hash !== erwartet) return false;
        const geaendert = await tx`UPDATE benutzer SET passwort_hash = ${passwortHash} WHERE id = ${benutzerId} AND haushalt_id = ${haushaltId} AND art = 'person' RETURNING 1`;
        if (geaendert.length !== 1) return false;
        await tx`UPDATE notfallcode SET hash = NULL WHERE haushalt_id = ${haushaltId}`;
        await tx`DELETE FROM sitzungen WHERE benutzer_id = ${benutzerId}`;
        await tx`DELETE FROM passwort_links WHERE benutzer_id = ${benutzerId}`;
        return true;
      }) as Promise<boolean>;
    },
  };
}
