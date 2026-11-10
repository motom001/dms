import { Resolver } from 'node:dns/promises';
import { anbieterFuerAdresse, anbieterFuerMx, anbieterFuerServer, domainVon, type MailAnbieterId, type MailVerbindung } from '../../shared/src/mailanbieter';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { MAILSUCHE_ANTWORT_MAX as MAX_ANTWORT } from './grenzen';

/**
 * Server und Port für den E-Mail-Versand aus der eigenen Adresse finden (#813) – in dieser Reihenfolge:
 *
 * 1. Eingebaute Liste gängiger Anbieter (shared/src/mailanbieter.ts): kein Netzaufruf.
 * 2. Sonst DNS der eigenen Domain: SRV `_submissions._tcp` und `_submission._tcp` (RFC 8314, RFC 6186) und MX
 *    (eigene Domain bei IONOS, Strato, Microsoft 365, Google). Die Anfrage geht an den DNS-Server des Geräts,
 *    sie enthält nur die Domain.
 * 3. Dann die Autoconfig-Datei des eigenen Anbieters: `https://autoconfig.<domain>/mail/config-v1.1.xml` und
 *    `https://<domain>/.well-known/autoconfig/mail/config-v1.1.xml` – nur an die eigene Domain, ohne die Adresse.
 * 4. Die Thunderbird-Datenbank (autoconfig.thunderbird.net) nur auf ausdrücklichen Wunsch (Knopf); dabei geht
 *    nur die Domain hinaus.
 *
 * Jede Abfrage hat ein Zeitlimit. Passwort und Adresse verlassen das Gerät dabei nie. `gefragt` nennt, wen
 * Ablago gefragt hat, damit die Oberfläche es zeigen kann.
 */

export type Fundquelle = 'liste' | 'dns' | 'mx' | 'autoconfig' | 'thunderbird';

export interface MailFund {
  host: string;
  port: number;
  verbindung: MailVerbindung;
  quelle: Fundquelle;
  /** Bekannter Anbieter (für Hinweise und OAuth). */
  anbieter: MailAnbieterId | null;
  /** Benutzername laut Autoconfig: die ganze Adresse (Standard) oder nur der Teil vor dem @. */
  benutzer: 'adresse' | 'lokalteil';
}

export interface MailSuche { fund: MailFund | null; domain: string; gefragt: string[] }

export interface SucheDeps {
  srv(name: string): Promise<Array<{ name: string; port: number; priority: number; weight: number }>>;
  mx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  /** fetch-ähnlich; Tests stellen ihn nach. */
  abruf(url: string, init: { signal: AbortSignal; redirect: 'error' | 'follow'; headers: Record<string, string> }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  /** Zeitlimit je Abfrage in Millisekunden. */
  zeitMs?: number;
}

export const SUCHE_ZEIT_MS = 4000;
const log = protokoll.modul('mail');

export function standardSuche(): SucheDeps {
  const r = new Resolver({ timeout: SUCHE_ZEIT_MS, tries: 1 });
  return {
    srv: (n) => r.resolveSrv(n),
    mx: (d) => r.resolveMx(d),
    abruf: (url, init) => fetch(url, init),
  };
}

const gueltigerHost = (h: string) => /^[a-z0-9.-]+$/i.test(h) && h.includes('.') && h.length <= 253;

/** Mit Zeitlimit; Fehler und Zeitüberschreitung gelten als „nichts gefunden“. */
async function mitZeit<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<null>((r) => { t = setTimeout(() => r(null), ms); })]);
  } catch { return null; } finally { clearTimeout(t); }
}

/** Ausgehender Server aus einer Autoconfig-Datei (config-v1.1.xml); bevorzugt SSL/TLS, dann STARTTLS. */
export function ausAutoconfig(xml: string): Omit<MailFund, 'quelle' | 'anbieter'> | null {
  const bloecke = [...xml.matchAll(/<outgoingServer\b[^>]*type\s*=\s*["']smtp["'][^>]*>([\s\S]*?)<\/outgoingServer>/gi)].map((m) => m[1]);
  const feld = (b: string, n: string) => (new RegExp(`<${n}>\\s*([^<]*?)\\s*</${n}>`, 'i').exec(b)?.[1] ?? '');
  const kandidaten = bloecke.map((b) => {
    const art = feld(b, 'socketType').toUpperCase();
    const verbindung: MailVerbindung | null = art === 'SSL' ? 'ssl' : art === 'STARTTLS' ? 'starttls' : null;
    const host = feld(b, 'hostname').toLowerCase();
    const port = Number(feld(b, 'port'));
    const benutzer: MailFund['benutzer'] = /%EMAILLOCALPART%/i.test(feld(b, 'username')) ? 'lokalteil' : 'adresse';
    return verbindung && gueltigerHost(host) && Number.isInteger(port) && port > 0 && port < 65536 ? { host, port, verbindung, benutzer } : null;
  }).filter((k): k is NonNullable<typeof k> => !!k);
  return kandidaten.find((k) => k.verbindung === 'ssl') ?? kandidaten[0] ?? null;
}

async function liesDatei(d: SucheDeps, url: string, redirect: 'error' | 'follow', ms: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await d.abruf(url, { signal: ctrl.signal, redirect, headers: { accept: t('meldungen.mailsuche.application-xml-text-xml') } });
    if (!r.ok) return null;
    const text = await r.text();
    return text.length > MAX_ANTWORT ? null : text;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Server zur Adresse suchen. `thunderbird`: nur die Thunderbird-Datenbank fragen (auf Knopfdruck). */
export async function sucheMailserver(email: unknown, o: { thunderbird?: boolean }, d: SucheDeps): Promise<MailSuche> {
  const adresse = typeof email === 'string' ? email.trim() : '';
  const domain = domainVon(adresse);
  if (!domain) throw new Fachfehler(422, t('meldungen.mailsuche.bitte-eine-gueltige-e'));
  const ms = d.zeitMs ?? SUCHE_ZEIT_MS;
  const gefragt: string[] = [];
  const fund = (x: Omit<MailFund, 'anbieter'>, anbieter?: MailAnbieterId | null): MailSuche =>
    ({ fund: { ...x, anbieter: anbieter ?? anbieterFuerServer(x.host)?.id ?? null }, domain, gefragt });

  // 1. Eingebaute Liste: kein Netz.
  const bekannt = anbieterFuerAdresse(adresse);
  if (bekannt) return fund({ host: bekannt.host, port: bekannt.port, verbindung: bekannt.verbindung, quelle: 'liste', benutzer: 'adresse' }, bekannt.id);

  if (o.thunderbird) {
    gefragt.push('autoconfig.thunderbird.net');
    const xml = await liesDatei(d, `https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`, 'follow', ms);
    const a = xml ? ausAutoconfig(xml) : null;
    log.info('Mailserver in der Thunderbird-Datenbank gesucht', { domain, gefunden: !!a });
    return a ? fund({ ...a, quelle: 'thunderbird' }) : { fund: null, domain, gefragt };
  }

  // 2. DNS der eigenen Domain (SRV, dann MX).
  gefragt.push(t('meldungen.mailsuche.dns', { domain }));
  const [ssl, starttls, mx] = await Promise.all([
    mitZeit(d.srv(`_submissions._tcp.${domain}`), ms), mitZeit(d.srv(`_submission._tcp.${domain}`), ms), mitZeit(d.mx(domain), ms),
  ]);
  const ersterSrv = (l: Awaited<ReturnType<SucheDeps['srv']>> | null) =>
    [...(l ?? [])].sort((a, b) => a.priority - b.priority || b.weight - a.weight).find((s) => s.name && s.name !== '.' && gueltigerHost(s.name) && s.port > 0);
  const s1 = ersterSrv(ssl), s2 = ersterSrv(starttls);
  if (s1 || s2) {
    const s = (s1 ?? s2)!;
    log.info('Mailserver über DNS gefunden', { domain, server: s.name });
    return fund({ host: s.name.toLowerCase().replace(/\.$/, ''), port: s.port, verbindung: s1 ? 'ssl' : 'starttls', quelle: 'dns', benutzer: 'adresse' });
  }
  const mxAnbieter = [...(mx ?? [])].sort((a, b) => a.priority - b.priority).map((m) => anbieterFuerMx(m.exchange)).find(Boolean);
  if (mxAnbieter) {
    log.info('Mailserver über den MX-Eintrag erkannt', { domain, anbieter: mxAnbieter.id });
    return fund({ host: mxAnbieter.host, port: mxAnbieter.port, verbindung: mxAnbieter.verbindung, quelle: 'mx', benutzer: 'adresse' }, mxAnbieter.id);
  }

  // 3. Autoconfig-Datei des eigenen Anbieters – ohne Weiterleitung an andere Adressen.
  for (const url of [`https://autoconfig.${domain}/mail/config-v1.1.xml`, `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`]) {
    gefragt.push(new URL(url).host);
    const xml = await liesDatei(d, url, 'error', ms);
    const a = xml ? ausAutoconfig(xml) : null;
    if (a) {
      log.info('Mailserver über die Autoconfig-Datei gefunden', { domain, server: a.host });
      return fund({ ...a, quelle: 'autoconfig' });
    }
  }
  log.info('Kein Mailserver zur Domain gefunden', { domain });
  return { fund: null, domain, gefragt };
}
