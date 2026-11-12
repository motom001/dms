/**
 * Dann-Karten nach außen (#671): **URL aufrufen** und **E-Mail senden** – der Weg, auf dem Ablago etwas nach draußen
 * meldet (seit #991 der einzige; den Zähler-Webhook gibt es nicht mehr).
 *
 * - **URL aufrufen:** `GET` oder `POST` an eine Adresse, die unter Werkbank → Automatisierungen → *Ziele nach außen*
 *   freigegeben ist ({@link AussenZiel}); einfache Parameter mit Platzhaltern; was mitgeht, bestimmt die
 *   **Inhaltsstufe** ({@link INHALTSSTUFEN}): nur Meldung, mit Kennungen, mit Werten (nur `POST`, nur nach Bestätigung).
 *   Signiert wie der Aufruf von außen (#679, Schema #627). Kein API-Client (Entscheidung Thomas 08.11.2026): keine
 *   eigenen Köpfe oder Anmeldung, keine JSON-Vorlagen, keine Antwort, die Ablago auswertet.
 * - **E-Mail senden:** Betreff und Text mit Platzhaltern; „An“ frei (Entscheidung Thomas 03.11.2026): Personen, Rollen,
 *   Felder der Mappe (Verweis auf Benutzer oder Text mit Format E-Mail) und beliebige Adressen. Nur Text, mit Hinweissatz.
 *
 * Hier Modell, Bereinigen, Prüfen, Kurzform und die Ziele. Zustellung (Ausgangskorb, Signatur, sicherer Abruf, Bremse)
 * im Server (`server/src/automatisierung/ausleitung.ts`, `sicherer-abruf.ts`, `server/src/automatisierung-aussen.ts`).
 */
import type { DannKarte, Empfaenger, WennKarte } from './automatisierung';
import { istBetriebWenn } from './ereignisse';
import { istEmail } from './feldformate';
import { heimnetzName, rechnername } from './heimnetz';
import type { Feld, Mappentyp } from './model';
import { t } from './texte';

/** Grenzen der Karten nach außen. Bytes (Antwort, Rumpf) stehen in server/src/grenzen.ts. */
export const AUSSEN_GRENZEN = {
  /** Länge einer Adresse (Ziel und Karte). */
  adresse: 2000,
  /** Parameter je Karte „URL aufrufen“; Länge eines Namens und eines Werts (nach dem Füllen gekürzt). */
  parameter: 10,
  name: 40,
  wert: 500,
  /** So viele freigegebene Ziele. */
  ziele: 50,
  /** Einträge unter „An“ und Empfänger je E-Mail-Karte und Lauf (nach dem Auflösen von Rollen und Feldern). */
  an: 20,
  empfaenger: 50,
  betreff: 200,
  text: 4000,
  /** Bremse „E-Mail senden“ über alle Prozesse: je Automatisierung und Tag, dazu alle zusammen je Tag. */
  mailsJeAutomatisierungJeTag: 50,
  mailsJeTag: 200,
  /** Ein Aufruf darf so lange dauern (Verbinden bis Ende der Antwort). */
  zeitlimitS: 10,
  /** Zustellungen im Verlauf je Automatisierung (und Tage, wie der Verlauf der Läufe). */
  verlauf: 50,
} as const;

/** Wie viel eine Karte „URL aufrufen“ mitschickt (#671). */
export const INHALTSSTUFEN = ['meldung', 'kennungen', 'werte'] as const;
export type Inhaltsstufe = (typeof INHALTSSTUFEN)[number];
export const AUSSEN_METHODEN = ['POST', 'GET'] as const;
export type AussenMethode = (typeof AUSSEN_METHODEN)[number];

/** Ein Parameter: Name (wie ein Platzhalter) und Wert (Text mit Platzhaltern). */
export interface AussenParameter { name: string; wert: string }

/** Dann-Karte „URL aufrufen“. `bestaetigt`: „Daten verlassen Ablago“ bestätigt (nur bei Inhalt „Mit Werten“ nötig). */
export interface DannUrl { id: string; art: 'url'; adresse: string; methode: AussenMethode; parameter: AussenParameter[]; inhalt: Inhaltsstufe; bestaetigt?: boolean }

/** „An“ der E-Mail: wie bei Aufgaben, dazu beliebige Adressen; `feld` auch ein Textfeld mit Format E-Mail. */
export type MailEmpfaenger = Empfaenger | { art: 'adresse'; adresse: string };
/** Dann-Karte „E-Mail senden“ (nur Text). */
export interface DannEmail { id: string; art: 'email'; an: MailEmpfaenger[]; betreff: string; text: string }

/**
 * Ein freigegebenes Ziel (Werkbank → Automatisierungen → Ziele nach außen): Adresse als Präfix (Schema, Rechner, Port,
 * Pfad – ohne `?` und `#`). `heimnetz`: ausdrücklich ein Ziel im Heimnetz – dann auch `http://` und Adressen, die
 * Ablago sonst nie anspricht (privat, Loopback, Link-Local). Metadaten-Adressen von Cloud-Anbietern nie.
 */
export interface AussenZiel { adresse: string; heimnetz: boolean; notiz?: string; erstellt?: string; von?: string | null }

/** Name eines Parameters: klein, wie ein Platzhalter. */
export const AUSSEN_PARAMETER_NAME = /^[a-z][a-z0-9_]*$/;

export const istUrlKarte = (k: { art: string }): k is DannUrl => k.art === 'url';
export const istEmailKarte = (k: { art: string }): k is DannEmail => k.art === 'email';
/** Karten, mit denen Daten Ablago verlassen – Pakete bringen sie nie mit (#671). */
export const AUSSEN_ARTEN: readonly string[] = ['url', 'email'];
export const istAussenKarte = (k: { art: string }) => AUSSEN_ARTEN.includes(k.art);

/* ---------- Ziele ---------- */

/** Pfad `p` liegt unter dem Präfix `praefix` (gleich oder darunter, an einer Grenze `/`). */
const pfadUnter = (p: string, praefix: string) => praefix === '/' || p === praefix || p.startsWith(praefix.endsWith('/') ? praefix : `${praefix}/`);

/** Adresse eines Ziels in einheitlicher Form (Rechner klein, ohne `?`/`#`, Pfad mindestens `/`); null, wenn ungültig. */
export function zielNormal(adresse: string): string | null {
  try {
    const u = new URL(adresse.trim());
    return `${u.protocol}//${u.host}${u.pathname || '/'}`;
  } catch { return null; }
}

/** Warum diese Adresse kein Ziel sein kann – null, wenn sie geht. */
export function zielProblem(adresse: string, heimnetz: boolean): string | null {
  const roh = adresse.trim();
  if (!roh) return t('gemeinsam.automatisierung.aussen.ziel.leer');
  if (roh.length > AUSSEN_GRENZEN.adresse) return t('gemeinsam.automatisierung.aussen.ziel.lang', { anzahl: AUSSEN_GRENZEN.adresse });
  let u: URL;
  try { u = new URL(roh); } catch { return t('gemeinsam.automatisierung.aussen.ziel.ungueltig'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return t('gemeinsam.automatisierung.aussen.ziel.schema');
  if (u.username || u.password) return t('gemeinsam.automatisierung.aussen.ziel.zugangsdaten');
  if (u.search || u.hash || roh.includes('?') || roh.includes('#')) return t('gemeinsam.automatisierung.aussen.ziel.abfrage');
  const host = rechnername(u) ?? '';
  const imHeimnetz = heimnetzName(host, 'hinweis');
  if (heimnetz && !imHeimnetz) return t('gemeinsam.automatisierung.aussen.ziel.kein-heimnetz');
  if (!heimnetz && u.protocol === 'http:') return t('gemeinsam.automatisierung.aussen.ziel.https');
  if (!heimnetz && imHeimnetz) return t('gemeinsam.automatisierung.aussen.ziel.heimnetz-noetig');
  return null;
}

/** Ziele bereinigen (Werkbank): gültige, ohne Doppelte, höchstens {@link AUSSEN_GRENZEN}.ziele. Fehler je Zeile. */
export function bereinigeZiele(roh: unknown): { ziele: AussenZiel[]; fehler: string[] } {
  const ziele: AussenZiel[] = [];
  const fehler: string[] = [];
  for (const x of (Array.isArray(roh) ? roh : [])) {
    const o = (x && typeof x === 'object' ? x : { adresse: x }) as Record<string, unknown>;
    const adresse = typeof o.adresse === 'string' ? o.adresse.trim() : '';
    if (!adresse) continue;
    const heimnetz = o.heimnetz === true;
    const p = zielProblem(adresse, heimnetz);
    if (p) { fehler.push(`${adresse}: ${p}`); continue; }
    const norm = zielNormal(adresse)!;
    if (ziele.some((z) => z.adresse === norm)) continue;
    const notiz = typeof o.notiz === 'string' ? o.notiz.trim().slice(0, 200) : '';
    ziele.push({ adresse: norm, heimnetz, ...(notiz ? { notiz } : {}), ...(typeof o.erstellt === 'string' ? { erstellt: o.erstellt } : {}), ...(typeof o.von === 'string' ? { von: o.von } : {}) });
  }
  if (ziele.length > AUSSEN_GRENZEN.ziele) fehler.push(t('gemeinsam.automatisierung.aussen.ziel.zuviele', { anzahl: AUSSEN_GRENZEN.ziele }));
  return { ziele: ziele.slice(0, AUSSEN_GRENZEN.ziele), fehler };
}

/**
 * Das freigegebene Ziel für eine Adresse – null, wenn keines passt. Gleiches Schema, gleicher Rechner und Port (über
 * `new URL`, nie als Zeichenfolge verglichen), Pfad gleich oder darunter; `http://` nur bei Heimnetz-Zielen; nie mit
 * Zugangsdaten in der Adresse.
 */
export function zielFuer(adresse: string, ziele: readonly AussenZiel[]): AussenZiel | null {
  let u: URL;
  try { u = new URL(adresse); } catch { return null; }
  if (u.username || u.password || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  for (const z of ziele) {
    let zu: URL;
    try { zu = new URL(z.adresse); } catch { continue; }
    if (u.protocol !== zu.protocol || u.hostname !== zu.hostname || u.port !== zu.port) continue;
    if (u.protocol === 'http:' && !z.heimnetz) continue;
    if (pfadUnter(u.pathname, zu.pathname)) return z;
  }
  return null;
}

/** Rechner einer Adresse für Anzeige und Protokoll (ohne Pfad und Abfrage). */
export function zielHost(adresse: string): string {
  try { return new URL(adresse).host; } catch { return '?'; }
}

/* ---------- Platzhalter und Inhaltsstufen ---------- */

/**
 * Platzhalter, die keine Inhalte der Ablage weitergeben: Datum, Name der Automatisierung, Mappentyp, Zeitpunkt, Stufe
 * und Modul einer Protokollmeldung, Versionen und Tage bis zum Datum. Bei „nur Meldung“ und „mit Kennungen“ sind nur
 * sie (und die Parameter eines Aufrufs von außen, #679) erlaubt – alles andere gibt Werte weiter.
 */
export const PLATZHALTER_OHNE_INHALT: readonly string[] = ['heute', 'automatisierung', 'mappentyp', 'zeitpunkt', 'stufe', 'modul', 'version', 'installiert', 'tage'];

/** Platzhalter in einem Text (`{name}` bzw. `{name|…}`). */
export const platzhalterIn = (text: string): string[] => [...text.matchAll(/\{([a-z][a-z0-9_]*)(?:\|[^{}|]*)*\}/g)].map((m) => m[1]);

/** Darf dieser Platzhalter bei der Stufe mit? Bei „Mit Werten“ alle (Passwörter füllt Ablago nie). */
export function platzhalterErlaubt(name: string, stufe: Inhaltsstufe, wenn: WennKarte): boolean {
  if (stufe === 'werte') return true;
  if (PLATZHALTER_OHNE_INHALT.includes(name)) return true;
  return wenn.art === 'aufruf' && (wenn as { parameter?: string[] }).parameter?.includes(name) === true;
}

/* ---------- Bereinigen ---------- */

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// eslint-disable-next-line no-control-regex -- Steuerzeichen bewusst entfernen (eine Zeile, z. B. der Betreff)
const eineZeile = (v: unknown, max: number) => text(typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ') : v, max);

export function bereinigeUrlKarte(x: Record<string, unknown>, kid: string): DannUrl {
  const methode: AussenMethode = x.methode === 'GET' ? 'GET' : 'POST';
  const inhalt: Inhaltsstufe = (INHALTSSTUFEN as readonly string[]).includes(String(x.inhalt)) ? x.inhalt as Inhaltsstufe : 'meldung';
  const namen = new Set<string>();
  const parameter = (Array.isArray(x.parameter) ? x.parameter : []).flatMap((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().toLowerCase() : '';
    if (!name || name.length > AUSSEN_GRENZEN.name || !AUSSEN_PARAMETER_NAME.test(name) || namen.has(name)) return [];
    namen.add(name);
    return [{ name, wert: eineZeile(o.wert, AUSSEN_GRENZEN.wert) }];
  }).slice(0, AUSSEN_GRENZEN.parameter);
  return { id: kid, art: 'url', adresse: eineZeile(x.adresse, AUSSEN_GRENZEN.adresse), methode, parameter, inhalt, ...(inhalt === 'werte' && x.bestaetigt === true ? { bestaetigt: true } : {}) };
}

function bereinigeMailEmpfaenger(e: unknown, empfaenger: (x: unknown) => Empfaenger | null): MailEmpfaenger | null {
  const x = (e ?? {}) as Record<string, unknown>;
  if (x.art === 'adresse') { const a = eineZeile(x.adresse, 254); return a ? { art: 'adresse', adresse: a } : null; }
  return empfaenger(e);
}

export function bereinigeEmailKarte(x: Record<string, unknown>, kid: string, empfaenger: (x: unknown) => Empfaenger | null): DannEmail {
  const an = (Array.isArray(x.an) ? x.an : []).slice(0, AUSSEN_GRENZEN.an).map((e) => bereinigeMailEmpfaenger(e, empfaenger)).filter((v): v is MailEmpfaenger => !!v);
  return { id: kid, art: 'email', an, betreff: eineZeile(x.betreff, AUSSEN_GRENZEN.betreff), text: text(x.text, AUSSEN_GRENZEN.text) };
}

/* ---------- Prüfen ---------- */

/** Ist das Feld ein E-Mail-Feld (Text mit Format E-Mail)? */
export const istEmailFeld = (f: Pick<Feld, 'typ' | 'format'> | undefined) => !!f && f.typ === 'text' && f.format === 'email';

/**
 * Was an einer Karte „URL aufrufen“ nicht passt. `ziele` (fehlt = nicht geprüft, z. B. Paket-Vorschau): Die Adresse muss
 * unter einem freigegebenen Ziel liegen – fällt das Ziel weg, hält die Automatisierung an.
 */
export function urlProbleme(k: DannUrl, wenn: WennKarte, ziele?: readonly AussenZiel[]): string[] {
  const p: string[] = [];
  const name = t('gemeinsam.automatisierung.aussen.url.name');
  if (!k.adresse) p.push(t('gemeinsam.automatisierung.aussen.url.adresse-fehlt', { name }));
  else {
    let u: URL | null = null;
    try { u = new URL(k.adresse); } catch { p.push(t('gemeinsam.automatisierung.aussen.url.adresse-ungueltig', { name })); }
    if (u && (u.username || u.password)) p.push(t('gemeinsam.automatisierung.aussen.url.zugangsdaten', { name }));
    else if (u && u.hash) p.push(t('gemeinsam.automatisierung.aussen.url.anker', { name }));
    else if (u && ziele && !zielFuer(k.adresse, ziele)) p.push(t('gemeinsam.automatisierung.aussen.url.nicht-freigegeben', { name, host: u.host }));
    if (u && platzhalterIn(decodeURIComponent(u.pathname + u.search)).length) p.push(t('gemeinsam.automatisierung.aussen.url.adresse-platzhalter', { name }));
  }
  if (k.inhalt === 'werte' && k.methode === 'GET') p.push(t('gemeinsam.automatisierung.aussen.url.werte-get', { name }));
  if (k.inhalt === 'werte' && !k.bestaetigt) p.push(t('gemeinsam.automatisierung.aussen.url.bestaetigen', { name }));
  const verboten = [...new Set(k.parameter.flatMap((x) => platzhalterIn(x.wert)).filter((x) => !platzhalterErlaubt(x, k.inhalt, wenn)))];
  if (verboten.length) p.push(t('gemeinsam.automatisierung.aussen.url.platzhalter-stufe', { name, liste: verboten.map((x) => `{${x}}`).join(', ') }));
  return p;
}

/** Was an einer Karte „E-Mail senden“ nicht passt (Empfänger aus Feldern nur Verweis auf Benutzer oder E-Mail-Feld). */
export function emailProbleme(k: DannEmail, typ: Mappentyp | null, ohneMappe: boolean, empfaengerProblem: (e: Empfaenger) => string | null): string[] {
  const p: string[] = [];
  const name = t('gemeinsam.automatisierung.aussen.email.name');
  if (!k.betreff) p.push(t('gemeinsam.automatisierung.aussen.email.betreff-fehlt', { name }));
  if (!k.text) p.push(t('gemeinsam.automatisierung.aussen.email.text-fehlt', { name }));
  if (!k.an.length) p.push(t('gemeinsam.automatisierung.aussen.email.an-fehlt', { name }));
  for (const e of k.an) {
    if (e.art === 'adresse') { if (!istEmail(e.adresse)) p.push(t('gemeinsam.automatisierung.aussen.email.adresse-ungueltig', { name, adresse: e.adresse })); continue; }
    if (ohneMappe && e.art !== 'person' && e.art !== 'rolle') { p.push(t('gemeinsam.automatisierung.aussen.email.ohne-mappe', { name })); continue; }
    if (e.art === 'feld' && istEmailFeld(typ?.felder.find((f) => f.key === e.feld))) continue;
    const x = empfaengerProblem(e);
    if (x) p.push(`${name}: ${x}`);
  }
  return p;
}

/** Eine Karte nach außen bereinigen (aus `bereinigeDann`). */
export function bereinigeAussen(x: Record<string, unknown>, kid: string, empfaenger: (x: unknown) => Empfaenger | null): DannUrl | DannEmail {
  return x.art === 'url' ? bereinigeUrlKarte(x, kid) : bereinigeEmailKarte(x, kid, empfaenger);
}

/** Probleme einer Dann- oder Sonst-Karte nach außen (leer bei anderen Karten). */
export function aussenProbleme(d: DannKarte, wenn: WennKarte, typ: Mappentyp | null, ziele: readonly AussenZiel[] | undefined, empfaengerProblem: (e: Empfaenger) => string | null): string[] {
  if (d.art === 'url') return urlProbleme(d, wenn, ziele);
  if (d.art !== 'email') return [];
  const ohneMappe = wenn.art === 'aufruf' || istBetriebWenn(wenn.art);
  return emailProbleme(d, typ, ohneMappe, empfaengerProblem);
}

/* ---------- Kurzform ---------- */

/** „POST an hooks.example.org“ */
export function urlKurz(k: DannUrl): string {
  return t('gemeinsam.automatisierung.aussen.url.kurz', { methode: k.methode, host: k.adresse ? zielHost(k.adresse) : '?' });
}

/** „E-Mail an Markus, l***@example.org“ – beliebige Adressen gekürzt (die Kurzform steht auch in Listen). */
export function emailKurz(k: DannEmail, wer: (e: Empfaenger) => string): string {
  const kurz = (a: string) => { const i = a.lastIndexOf('@'); return i < 1 ? a : `${[...a.slice(0, i)][0]}***${a.slice(i)}`; };
  return t('gemeinsam.automatisierung.aussen.email.kurz', { an: k.an.map((e) => (e.art === 'adresse' ? kurz(e.adresse) : wer(e))).join(', ') || '?' });
}

/** Kurzform einer Karte nach außen. */
export const aussenKurz = (k: DannUrl | DannEmail, wer: (e: Empfaenger) => string) => (k.art === 'url' ? urlKurz(k) : emailKurz(k, wer));

/** Karten einer Automatisierung, mit denen Daten hinausgehen (Pakete, Notfallblatt, Übersicht). */
export const aussenKarten = (d: { dann: DannKarte[]; sonst: DannKarte[] }) => [...d.dann, ...d.sonst].filter(istAussenKarte) as Array<DannUrl | DannEmail>;
