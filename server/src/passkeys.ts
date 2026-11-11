import { randomUUID } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { PASSKEY_ANTWORT_MAX } from './grenzen';
import { hashe, speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { neuerSchluessel } from './passwort';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { RollenPflicht, type Pflicht, type PflichtPerson } from './zweifaktor';
import { PASSKEY_NAME_MAX, PASSKEYS_HOECHSTENS } from '../../shared/src/passkey';

export { PASSKEY_NAME_MAX, PASSKEYS_HOECHSTENS };

/**
 * Passkeys (#811, WebAuthn): Anmeldung mit Fingerabdruck, Gesicht oder Geräte-PIN – als eigener Weg, als zweiter Faktor
 * und für die erneute Anmeldung im Verwaltungsmodus. Die Kryptografie (CBOR, COSE-Schlüssel, Signaturen) prüft die
 * Bibliothek `@simplewebauthn/server`; hier liegt, was Ablago dazu festlegt:
 *
 * - **Gebunden an die Adresse:** RP-ID und erwarteter Origin kommen aus der Adresse von Ablago (Werkbank → Betrieb,
 *   sonst die Adresse der Anfrage). Nur über HTTPS mit einem Namen (keine IP-Adresse) oder auf `localhost`. Jeder
 *   Passkey merkt sich seine RP-ID: Ändert sich die Adresse, passen vorhandene Passkeys nicht mehr (die Oberfläche
 *   sagt das), sie gelten dann einfach nicht.
 * - **Herausforderung einmalig und kurz** (5 Minuten) im Kurzzustand (#744) – so geht es mit mehreren Prozessen, und
 *   `nimm` löst sie genau einmal ein, auch bei gleichzeitigen Anfragen.
 * - **Nutzer-Verifizierung** (PIN, Biometrie) ist immer verlangt; ein bloßes Antippen eines Schlüssels genügt nicht.
 * - **Zähler:** Meldet ein Passkey einen Zähler, der nicht steigt, ist er womöglich kopiert – abgelehnt, mit Warnung
 *   im Protokoll. Gespeichert wird nur mit Vergleich (`tausche`), damit zwei Prozesse den Zähler nicht zurückdrehen.
 * - **Gespeichert** in den Einstellungen (`passkeys_<Konto>`), wie die Zwei-Faktor-Anmeldung: nur öffentliche Schlüssel,
 *   nichts Geheimes. Damit sind sie in der Sicherung; im Vollexport und in der Einrichtungsdatei nicht.
 * - **Protokoll** nur mit Konto und Name des Passkeys – keine Kennungen, keine Schlüssel, keine Herausforderungen.
 */

const log = protokoll.modul('konto');

/** Wie lange eine Herausforderung gilt. */
const HERAUSFORDERUNG_MS = 5 * 60_000;
/** Höchstens so viele offene Anmelde-Herausforderungen insgesamt (Schutz gegen Fluten des Kurzzustands). */
const OFFEN_HOECHSTENS = 2000;

const NEU = 'passkey-neu';
const ANMELDUNG = 'passkey-anmeldung';

/** Relying Party: für wen der Passkey gilt. */
export interface RelyingParty { rpId: string; origin: string; name: string }

/**
 * RP aus einer Adresse wie `https://ablago.example.org` oder `http://localhost:8080`. null, wenn Passkeys dort nicht
 * gehen: ohne HTTPS (außer `localhost`) oder mit einer IP-Adresse (eine RP-ID muss ein Name sein).
 */
export function relyingParty(adresse: string, name = 'Ablago'): RelyingParty | null {
  let u: URL;
  try { u = new URL(adresse); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const lokal = host === 'localhost' || host.endsWith('.localhost');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && lokal)) return null;
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  return { rpId: host, origin: u.origin, name: name || 'Ablago' };
}

/** So liegt ein Passkey in den Einstellungen – nur Öffentliches. */
interface Eintrag {
  /** Eigene Kennung für Oberfläche und Routen (nicht die des Authenticators). */
  nr: string;
  /** Kennung des Authenticators (base64url). */
  id: string;
  /** Öffentlicher Schlüssel (COSE, base64url). */
  oeffentlich: string;
  zaehler: number;
  name: string;
  rpId: string;
  erstellt: string;
  zuletzt: string | null;
  transports: string[];
  /** Auf mehrere Geräte übertragbar (z. B. in einem Passwortmanager oder der Cloud des Handys). */
  mehrgeraete: boolean;
}
interface Gespeichert { liste: Eintrag[] }

/** Für die Oberfläche (Mein Konto → Sicherheit). */
export interface PasskeyAnsicht { nr: string; name: string; erstellt: string; zuletzt: string | null; mehrgeraete: boolean; passt: boolean; rpId: string }

/** Wozu eine Anmelde-Herausforderung ausgegeben wurde. */
export type PasskeyZweck = 'anmelden' | 'zweiter-schritt' | 'bestaetigen';
interface Herausforderung { challenge: string; rpId: string; origin: string; zweck: PasskeyZweck; benutzerId: string | null; bezug: string | null }

/** Was eine geprüfte Anmeldung liefert. */
export interface PasskeyTreffer { benutzerId: string; name: string; zweck: PasskeyZweck; bezug: string | null }

const istUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
/** Name ohne Steuerzeichen, Leerraum zusammengefasst, gekürzt; leer = `ersatz`. */
const nameAus = (v: unknown, ersatz: string) => {
  const roh = [...(typeof v === 'string' ? v : '')].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
  const s = roh.replace(/\s+/g, ' ').trim().slice(0, PASSKEY_NAME_MAX);
  return s || ersatz;
};
/** Allgemeine Ablehnung – den Grund schreibt nur das Protokoll. */
const falsch = () => new Fachfehler(401, t('anmeldung.passkey.fehler.falsch'));
const groesse = (x: unknown) => { try { return JSON.stringify(x ?? null).length; } catch { return Infinity; } };

export class Passkeys {
  private zustand: Kurzzustand;
  /** Passkey für alle bzw. je Rolle vorschreiben (wie die Zwei-Faktor-Anmeldung, #242). */
  readonly vorschrift: RollenPflicht;

  /**
   * @param adresse Adresse von Ablago je Anfrage (gepflegt oder die der Anfrage).
   * @param name Name, den das Gerät beim Anlegen zeigt (Schriftzug des Designs).
   */
  constructor(private speicher: Einstellungen, private adresse: () => string, zustand?: Kurzzustand, private jetzt: () => number = Date.now, private name: () => Promise<string> = async () => 'Ablago') {
    this.zustand = zustand ?? speicherKurzzustand(jetzt);
    this.vorschrift = new RollenPflicht(speicher, 'passkey_pflicht', 'Pflicht zum Passkey geändert', jetzt);
  }

  /** RP der aktuellen Anfrage; null = Passkeys gehen hier nicht (kein HTTPS). */
  rp(): RelyingParty | null { return relyingParty(this.adresse()); }
  private async rpMitName(): Promise<RelyingParty> {
    const rp = this.rp();
    if (!rp) throw new Fachfehler(409, t('anmeldung.passkey.fehler.https'), { https: false });
    return { ...rp, name: (await this.name()) || 'Ablago' };
  }

  private schluessel(id: string) { return `passkeys_${id}`; }
  /** Gespeicherter Stand; `roh` ist der Wert, wie er in der Datenbank steht (für den Vergleich beim Schreiben). */
  private async lies(id: string): Promise<Gespeichert & { roh: unknown }> {
    const roh = await this.speicher.lies(this.schluessel(id));
    const g = roh as Gespeichert | null;
    return { roh, liste: Array.isArray(g?.liste) ? g.liste : [] };
  }
  /**
   * Nur schreiben, wenn noch `alt.roh` drinsteht (wie bei der Zwei-Faktor-Anmeldung, #744): Zwei Prozesse überschreiben
   * sich so nie gegenseitig – etwa einen Zähler, den der andere gerade hochgesetzt hat.
   */
  private async ersetze(id: string, alt: { roh: unknown }, neu: Gespeichert): Promise<boolean> {
    if (this.speicher.tausche) return this.speicher.tausche(this.schluessel(id), alt.roh ?? null, { liste: neu.liste });
    await this.speicher.schreibe(this.schluessel(id), { liste: neu.liste });
    return true;
  }

  /** Passkeys einer Person, die zur aktuellen Adresse passen. */
  private passende(g: Gespeichert, rp: RelyingParty | null) { return rp ? g.liste.filter((e) => e.rpId === rp.rpId) : []; }

  /** Hat die Person einen Passkey, der hier (bei dieser Adresse, über HTTPS) gilt? */
  async nutzbar(id: string): Promise<boolean> { return this.passende(await this.lies(id), this.rp()).length > 0; }
  /** Hat die Person überhaupt einen Passkey (auch für eine andere Adresse)? */
  async anzahl(id: string): Promise<number> { return (await this.lies(id)).liste.length; }

  async liste(id: string): Promise<PasskeyAnsicht[]> {
    const rp = this.rp();
    return (await this.lies(id)).liste.map((e) => ({ nr: e.nr, name: e.name, erstellt: e.erstellt, zuletzt: e.zuletzt, mehrgeraete: e.mehrgeraete, passt: !!rp && e.rpId === rp.rpId, rpId: e.rpId }));
  }

  /* ---------- Pflicht ---------- */

  async pflicht(): Promise<Pflicht> { return this.vorschrift.pflicht(); }
  async setzePflicht(x: unknown, von: string): Promise<Pflicht> { return this.vorschrift.setze(x, von); }
  /** Gilt die Pflicht für diese Person (unabhängig davon, ob sie schon einen Passkey hat)? Ohne HTTPS nie. */
  async pflichtGilt(b: PflichtPerson): Promise<boolean> { return !!this.rp() && (await this.vorschrift.lage(b, undefined, async () => false)) !== 'ok'; }
  /**
   * 'fehlt' / 'ausstehend' / 'ok' wie bei der Zwei-Faktor-Anmeldung (#242, #416). Ohne HTTPS lässt sich kein Passkey
   * anlegen – dann sperrt die Pflicht niemanden aus ('ok'); die Werkbank zeigt das.
   */
  async lage(b: PflichtPerson, sitzungSeit?: Date): Promise<'ok' | 'ausstehend' | 'fehlt'> {
    if (!this.rp()) return 'ok';
    return this.vorschrift.lage(b, sitzungSeit, () => this.nutzbar(b.id));
  }
  async fehlt(b: PflichtPerson, sitzungSeit?: Date): Promise<boolean> { return (await this.lage(b, sitzungSeit)) === 'fehlt'; }

  /* ---------- Hinzufügen ---------- */

  /** Schritt 1: Optionen für `navigator.credentials.create()`; die Herausforderung gilt 5 Minuten und einmal. */
  async beginneRegistrierung(b: { id: string; email: string; name: string }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const rp = await this.rpMitName();
    const g = await this.lies(b.id);
    if (g.liste.length >= PASSKEYS_HOECHSTENS) throw new Fachfehler(409, t('anmeldung.passkey.fehler.zu-viele', { anzahl: PASSKEYS_HOECHSTENS }));
    const optionen = await generateRegistrationOptions({
      rpName: rp.name, rpID: rp.rpId, userName: b.email, userDisplayName: b.name || b.email,
      // Kennung für das Gerät: die Konto-Id (zufällig, keine E-Mail-Adresse) – so findet die Anmeldung ohne E-Mail das Konto.
      userID: new TextEncoder().encode(b.id),
      attestationType: 'none',
      excludeCredentials: this.passende(g, rp).map((e) => ({ id: e.id, transports: e.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await this.zustand.setze(NEU, b.id, { challenge: optionen.challenge, rpId: rp.rpId, origin: rp.origin }, this.jetzt() + HERAUSFORDERUNG_MS);
    return optionen;
  }

  /** Schritt 2: Antwort des Geräts prüfen und speichern. Die Herausforderung ist danach verbraucht – auch bei Fehlern. */
  async bestaetigeRegistrierung(b: { id: string; email: string }, antwort: unknown, name: unknown): Promise<PasskeyAnsicht> {
    if (groesse(antwort) > PASSKEY_ANTWORT_MAX) throw new Fachfehler(413, t('anmeldung.passkey.fehler.antwort'));
    const h = (await this.zustand.nimm(NEU, b.id))?.wert as { challenge: string; rpId: string; origin: string } | undefined;
    if (!h) throw new Fachfehler(409, t('anmeldung.passkey.fehler.abgelaufen'));
    let info;
    try {
      const r = await verifyRegistrationResponse({
        response: antwort as RegistrationResponseJSON, expectedChallenge: h.challenge, expectedOrigin: h.origin, expectedRPID: h.rpId,
        requireUserPresence: true, requireUserVerification: true,
      });
      if (!r.verified) throw new Error('nicht bestätigt');
      info = r.registrationInfo;
    } catch (e) {
      log.warn('Passkey nicht hinzugefügt: Antwort des Geräts ungültig', { benutzer: b.email, grund: (e as Error).message.slice(0, 200) });
      throw new Fachfehler(422, t('anmeldung.passkey.fehler.ungueltig'));
    }
    for (let i = 0; i < 3; i++) {
      const g = await this.lies(b.id);
      if (g.liste.some((e) => e.id === info.credential.id)) throw new Fachfehler(409, t('anmeldung.passkey.fehler.doppelt'));
      if (g.liste.length >= PASSKEYS_HOECHSTENS) throw new Fachfehler(409, t('anmeldung.passkey.fehler.zu-viele', { anzahl: PASSKEYS_HOECHSTENS }));
      const e: Eintrag = {
        nr: randomUUID(), id: info.credential.id, oeffentlich: Buffer.from(info.credential.publicKey).toString('base64url'),
        zaehler: info.credential.counter, name: nameAus(name, t('anmeldung.passkey.name.standard', { nr: g.liste.length + 1 })), rpId: h.rpId,
        erstellt: new Date(this.jetzt()).toISOString(), zuletzt: null,
        transports: (info.credential.transports ?? []).filter((x) => typeof x === 'string').slice(0, 8), mehrgeraete: info.credentialDeviceType === 'multiDevice',
      };
      if (await this.ersetze(b.id, g, { liste: [...g.liste, e] })) {
        log.info('Passkey hinzugefügt', { benutzer: b.email, name: e.name, mehrgeraete: e.mehrgeraete });
        return { nr: e.nr, name: e.name, erstellt: e.erstellt, zuletzt: null, mehrgeraete: e.mehrgeraete, passt: true, rpId: e.rpId };
      }
    }
    throw new Fachfehler(409, t('anmeldung.passkey.fehler.gleichzeitig'));
  }

  /* ---------- Benennen und entfernen ---------- */

  async benenne(b: { id: string; email: string }, nr: string, name: unknown): Promise<PasskeyAnsicht[]> {
    for (let i = 0; i < 3; i++) {
      const g = await this.lies(b.id);
      const e = g.liste.find((x) => x.nr === nr);
      if (!e) throw new Fachfehler(404, t('anmeldung.passkey.fehler.unbekannt'));
      const neu = nameAus(name, e.name);
      if (await this.ersetze(b.id, g, { liste: g.liste.map((x) => (x.nr === nr ? { ...x, name: neu } : x)) })) {
        log.info('Passkey umbenannt', { benutzer: b.email, vorher: e.name, nachher: neu });
        return this.liste(b.id);
      }
    }
    throw new Fachfehler(409, t('anmeldung.passkey.fehler.gleichzeitig'));
  }

  /** Einen Passkey entfernen. Die frische Anmeldung prüft die Route. */
  async entferne(b: { id: string; email: string }, nr: string, von: string): Promise<PasskeyAnsicht[]> {
    for (let i = 0; i < 3; i++) {
      const g = await this.lies(b.id);
      const e = g.liste.find((x) => x.nr === nr);
      if (!e) throw new Fachfehler(404, t('anmeldung.passkey.fehler.unbekannt'));
      if (await this.ersetze(b.id, g, { liste: g.liste.filter((x) => x.nr !== nr) })) {
        log.warn('Passkey entfernt', { benutzer: b.email, name: e.name, von });
        return this.liste(b.id);
      }
    }
    throw new Fachfehler(409, t('anmeldung.passkey.fehler.gleichzeitig'));
  }

  /** Alle Passkeys einer Person entfernen (Verwaltung, Notfallzugang, Befehl dms). Liefert die Anzahl. */
  async entferneAlle(id: string, wer: string, von: string): Promise<number> {
    const n = (await this.lies(id)).liste.length;
    if (!n) return 0;
    await this.speicher.schreibe(this.schluessel(id), null);
    log.warn('Alle Passkeys entfernt', { benutzer: wer, anzahl: n, von });
    return n;
  }

  /* ---------- Anmelden ---------- */

  /**
   * Optionen für `navigator.credentials.get()` und eine Kennung, unter der die Herausforderung liegt (nur ihr Hash steht
   * im Kurzzustand). Mit `benutzerId` nur deren Passkeys (zweiter Schritt, erneute Anmeldung); ohne fragt das Gerät,
   * welcher Passkey (Anmeldung ohne E-Mail-Adresse).
   */
  async beginneAnmeldung(zweck: PasskeyZweck, benutzerId: string | null = null, bezug: string | null = null): Promise<{ kennung: string; optionen: PublicKeyCredentialRequestOptionsJSON }> {
    const rp = await this.rpMitName();
    if ((await this.zustand.anzahl(ANMELDUNG)) >= OFFEN_HOECHSTENS) throw new Fachfehler(429, t('anmeldung.passkey.fehler.viele'));
    let allow: Array<{ id: string; transports?: string[] }> | undefined;
    if (benutzerId) {
      allow = this.passende(await this.lies(benutzerId), rp).map((e) => ({ id: e.id, transports: e.transports }));
      if (!allow.length) throw new Fachfehler(409, t('anmeldung.passkey.fehler.keiner'));
    }
    const optionen = await generateAuthenticationOptions({ rpID: rp.rpId, allowCredentials: allow, userVerification: 'required' });
    const kennung = neuerSchluessel();
    await this.zustand.setze(ANMELDUNG, hashe(kennung), { challenge: optionen.challenge, rpId: rp.rpId, origin: rp.origin, zweck, benutzerId, bezug } satisfies Herausforderung, this.jetzt() + HERAUSFORDERUNG_MS);
    return { kennung, optionen };
  }

  /**
   * Für den Anmeldeschutz vor der Prüfung: Welches Konto nennt die Anfrage? Die Herausforderung (zweiter Schritt,
   * erneute Anmeldung) oder sonst die Kennung des Kontos, die das Gerät mitschickt. Nur ein Hinweis – geprüft wird in
   * `pruefeAnmeldung`.
   */
  async vermutlich(kennung: unknown, antwort: unknown): Promise<{ benutzerId: string | null; zweck: PasskeyZweck | null; bezug: string | null }> {
    const h = typeof kennung === 'string' && kennung ? (await this.zustand.lies(ANMELDUNG, hashe(kennung)))?.wert as Herausforderung | undefined : undefined;
    if (h?.benutzerId) return { benutzerId: h.benutzerId, zweck: h.zweck, bezug: h.bezug };
    return { benutzerId: benutzerAusAntwort(antwort), zweck: h?.zweck ?? null, bezug: h?.bezug ?? null };
  }

  /**
   * Antwort des Geräts prüfen: Herausforderung einmal einlösen, Passkey suchen (bei gebundener Herausforderung nur unter
   * diesem Konto), Signatur, Origin, RP-ID, Nutzer-Verifizierung und Zähler prüfen, Zähler speichern.
   * Wirft 401 mit einer allgemeinen Meldung; den Grund schreibt nur das Protokoll.
   */
  async pruefeAnmeldung(kennung: unknown, antwort: unknown, erwartet: { zweck: PasskeyZweck; benutzerId?: string }): Promise<PasskeyTreffer> {
    if (groesse(antwort) > PASSKEY_ANTWORT_MAX) throw new Fachfehler(413, t('anmeldung.passkey.fehler.antwort'));
    const h = typeof kennung === 'string' && kennung ? (await this.zustand.nimm(ANMELDUNG, hashe(kennung)))?.wert as Herausforderung | undefined : undefined;
    if (!h) throw new Fachfehler(401, t('anmeldung.passkey.fehler.abgelaufen'));
    if (h.zweck !== erwartet.zweck || (erwartet.benutzerId && h.benutzerId !== erwartet.benutzerId)) throw falsch();
    const a = antwort as AuthenticationResponseJSON | null;
    const credId = a && typeof a === 'object' && typeof a.id === 'string' ? a.id : '';
    const benutzerId = h.benutzerId ?? benutzerAusAntwort(antwort);
    if (!credId || !benutzerId) throw falsch();
    const g = await this.lies(benutzerId);
    const e = g.liste.find((x) => x.id === credId && x.rpId === h.rpId);
    if (!e) { log.warn('Anmeldung mit Passkey abgelehnt: Passkey unbekannt', { zweck: h.zweck }); throw falsch(); }
    const neuerZaehler = await this.signatur(a!, h, e);
    await this.merkeBenutzung(benutzerId, g, e, neuerZaehler, h.zweck);
    return { benutzerId, name: e.name, zweck: h.zweck, bezug: h.bezug };
  }

  /** Signatur, Origin, RP-ID, Nutzer-Verifizierung und Zähler prüfen (Bibliothek); liefert den neuen Zähler. */
  private async signatur(a: AuthenticationResponseJSON, h: Herausforderung, e: Eintrag): Promise<number> {
    try {
      const r = await verifyAuthenticationResponse({
        response: a, expectedChallenge: h.challenge, expectedOrigin: h.origin, expectedRPID: h.rpId, requireUserVerification: true,
        credential: { id: e.id, publicKey: Buffer.from(e.oeffentlich, 'base64url'), counter: e.zaehler, transports: e.transports },
      });
      if (!r.verified) throw new Error('nicht bestätigt');
      return r.authenticationInfo.newCounter;
    } catch (x) {
      const m = (x as Error).message;
      if (/counter/i.test(m)) log.warn('Passkey abgelehnt: Zähler nicht gestiegen – womöglich kopiert', { passkey: e.name, zweck: h.zweck });
      else log.warn('Anmeldung mit Passkey abgelehnt', { passkey: e.name, zweck: h.zweck, grund: m.replace(/"[^"]*"/g, '…').slice(0, 200) });
      throw falsch();
    }
  }

  /**
   * Zähler und „zuletzt benutzt“ speichern – nur mit Vergleich: Holt ein anderer Prozess denselben Zähler, verliert einer.
   * Ist der Zähler inzwischen nicht mehr kleiner als der neue, war es eine Wiederholung oder eine Kopie.
   */
  private async merkeBenutzung(benutzerId: string, g: Gespeichert & { roh: unknown }, e: Eintrag, neuerZaehler: number, zweck: PasskeyZweck) {
    const jetzt = new Date(this.jetzt()).toISOString();
    for (let i = 0; i < 3; i++) {
      const akt = i === 0 ? g : await this.lies(benutzerId);
      const x = akt.liste.find((y) => y.nr === e.nr);
      if (!x) throw falsch();
      if ((neuerZaehler > 0 || x.zaehler > 0) && neuerZaehler <= x.zaehler) {
        log.warn('Passkey abgelehnt: Zähler nicht gestiegen – womöglich kopiert', { passkey: e.name, zweck });
        throw falsch();
      }
      if (await this.ersetze(benutzerId, akt, { liste: akt.liste.map((y) => (y.nr === e.nr ? { ...y, zaehler: neuerZaehler, zuletzt: jetzt } : y)) })) return;
    }
    throw falsch();
  }
}

/** Konto-Id aus `response.userHandle` (base64url der UTF-8-Bytes der Id) – nur, wenn es eine Id sein kann. */
export function benutzerAusAntwort(antwort: unknown): string | null {
  const r = (antwort as { response?: { userHandle?: unknown } } | null)?.response;
  if (!r || typeof r.userHandle !== 'string' || r.userHandle.length > 200) return null;
  const s = Buffer.from(r.userHandle, 'base64url').toString('utf8');
  return istUuid(s) ? s.toLowerCase() : null;
}
