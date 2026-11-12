import {
  AUSSEN_GRENZEN, istAufruf, istBetrieb, istEmailFeld, platzhalterErlaubt, zielHost,
  type DannEmail, type DannKarte, type DannUrl, type Empfaenger, type MailEmpfaenger,
} from '../../shared/src/automatisierung';
import { istEmail } from '../../shared/src/feldformate';
import { formatiere, type Feld } from '../../shared/src/model';
import { uebersetzer } from '../../shared/src/sprache';
import texte from '../../shared/src/sprachen/de/automatisierung.json';
import { DANN_AUSFUEHRER, KarteLeer, type KartenKontext } from './automatisierung';
import { Fachfehler } from './fehler';
import { AUSSEN_RUMPF_MAX, AUSSEN_WERT_MAX } from './grenzen';
import { istUuid } from './repo';
import { t } from './sprache';
import { istVerschluesselt } from './tresor';

/**
 * Dann-Karten nach außen (#671) – ausgeführt unter dem Systemkonto „Automatisierung“. Beide legen ihre Zustellung nur in
 * den Ausgangskorb (`automatisierung/ausleitung.ts`); zugestellt wird danach mit Wiederholung, Signatur und SSRF-Schutz.
 *
 * - **URL aufrufen:** Was mitgeht, bestimmt die Inhaltsstufe – technisch, nicht nur in der Oberfläche:
 *   *nur Meldung* (Ereignis, Ereignis-Id, Zeit, Name der Automatisierung), *mit Kennungen* (dazu Mappen-Id, Mappentyp,
 *   geänderte Feldschlüssel, Link in die Ablage), *mit Werten* (dazu Titel und Werte – nur bei POST und nach Bestätigung;
 *   nur Felder, die das Systemkonto lesen darf, nie Passwort- und verschlüsselte Werte; bei „gespeichert“ nur die
 *   geänderten Felder). Platzhalter in Parametern: bei den ersten beiden Stufen nur solche ohne Inhalt (übrige bleiben
 *   leer), Werte mit den Rechten des Systemkontos. Die Adresse selbst hat keine Platzhalter.
 * - **E-Mail senden:** je Empfänger eine Mail (nur Text) mit Hinweissatz am Ende. Platzhalter für Personen mit Konto mit
 *   deren Rechten (#795), für feste Adressen mit denen des Systemkontos. E-Mail-Felder setzt jeder, der die Mappe
 *   bearbeiten darf – dort mit den Rechten der auslösenden Person (geschnitten mit denen des Systemkontos), nur ohne
 *   sie (Zeitplan, Datum, System) mit denen des Systemkontos. Bremse je Automatisierung und Tag sowie für alle
 *   zusammen (über alle Prozesse).
 */
const tx = uebersetzer({ automatisierung: texte });

/** Kontext ohne die Karte: was beide Karten zusammenstellen. */
function meldung(c: KartenKontext): Record<string, unknown> {
  return { ereignis: c.automatisierung.wenn.art === 'aufruf' ? 'aufruf' : String(c.anlassArt ?? c.automatisierung.wenn.art), id: c.ereignisId, zeit: new Date().toISOString(), automatisierung: c.automatisierung.name };
}

/** Kennungen: Mappe, Mappentyp, geänderte Feldschlüssel, Link – nur, wenn es eine Mappe gibt. */
function kennungen(c: KartenKontext): Record<string, unknown> {
  if (!c.mappe || !c.typ) return {};
  const felder = Array.isArray(c.daten.felder) ? (c.daten.felder as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const basis = (c.aussen?.basis() ?? '').replace(/\/+$/, '');
  return {
    mappe: c.mappe.id, mappentyp: c.typ.schluessel ?? c.typ.id, ...(felder.length ? { felder } : {}),
    ...(basis ? { link: `${basis}/ablage/typ:${c.typ.id}/${c.mappe.id}` } : {}),
  };
}

/**
 * Werte (#671, Stufe „Mit Werten“): Titel und Feldwerte als Text, wie die Oberfläche sie zeigt. Nur Felder des Typs,
 * wie ihn das Systemkonto sieht; nie Passwortfelder, nie verschlüsselte Werte, keine Tabellen; Verweise nur mit Titeln
 * lesbarer Mappen. Bei „gespeichert“ mit genannten Feldern nur diese.
 */
async function werte(c: KartenKontext): Promise<Record<string, unknown>> {
  if (!c.mappe || !c.typ) return {};
  const typ = c.z.typen.get(c.mappe.typId) ?? c.typ;
  const genannt = Array.isArray(c.daten.felder) ? new Set((c.daten.felder as unknown[]).map(String)) : null;
  const felder = typ.felder.filter((f: Feld) => f.typ !== 'passwort' && f.typ !== 'tabelle' && (!genannt?.size || genannt.has(f.key)));
  const refs = felder.filter((f) => f.typ === 'referenz').flatMap((f) => { const v = c.mappe!.werte[f.key]; return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && istUuid(x)); });
  const titel = refs.length ? await c.dienst.automatisierungshilfen.lesbareTitel(c.z, refs) : new Map<string, string>();
  const w: Record<string, string> = {};
  for (const f of felder) {
    const roh = c.mappe.werte[f.key];
    if (roh === undefined || roh === null || roh === '' || istVerschluesselt(roh) || JSON.stringify(roh).includes('dms1$')) continue;
    w[f.key] = formatiere(f, roh as never, (id) => titel.get(id) ?? tx('automatisierung.platzhalter.nicht-sichtbar')).slice(0, AUSSEN_WERT_MAX);
  }
  return { titel: c.mappe.titel ?? '', werte: w };
}

/** Parameter füllen: nicht erlaubte Platzhalter (Stufe) bleiben leer; Werte mit den Rechten des Systemkontos, gekürzt. */
async function parameter(k: DannUrl, c: KartenKontext): Promise<Record<string, string>> {
  const p: Record<string, string> = {};
  for (const x of k.parameter) {
    const erlaubt = x.wert.replace(/\{([a-z][a-z0-9_]*)((?:\|[^{}|]*)*)\}/g, (ganz, name: string) => (platzhalterErlaubt(name, k.inhalt, c.automatisierung.wenn) ? ganz : ''));
    p[x.name] = (await c.fuelle(erlaubt)).slice(0, AUSSEN_GRENZEN.wert);
  }
  return p;
}

DANN_AUSFUEHRER.url = async (k: DannKarte, c: KartenKontext) => {
  if (k.art !== 'url') throw new Fachfehler(500, t('meldungen.automatisierungkarten.falsche-karte'));
  if (!c.aussen) throw new Fachfehler(500, tx('automatisierung.karte.url.fehlt'));
  // Sicherheit (zweite Stelle neben der Prüfung beim Speichern): Werte nur per POST und nach Bestätigung.
  if (k.inhalt === 'werte' && (k.methode !== 'POST' || !k.bestaetigt)) throw new Fachfehler(422, tx('automatisierung.karte.url.werte'));
  const inhalt: Record<string, unknown> = { ...meldung(c), ...(k.inhalt !== 'meldung' ? kennungen(c) : {}), ...(k.inhalt === 'werte' ? await werte(c) : {}) };
  const p = await parameter(k, c);
  let adresse = k.adresse;
  let rumpf: string | null = null;
  if (k.methode === 'GET') {
    const u = new URL(k.adresse);
    for (const [n, v] of Object.entries(inhalt)) u.searchParams.set(n, Array.isArray(v) ? v.join(',') : String(v));
    for (const [n, v] of Object.entries(p)) u.searchParams.set(n, v);
    adresse = u.toString();
  } else {
    rumpf = JSON.stringify({ ...inhalt, ...(k.parameter.length ? { parameter: p } : {}) });
    if (Buffer.byteLength(rumpf) > AUSSEN_RUMPF_MAX) throw new Fachfehler(413, tx('automatisierung.karte.url.zu-gross'));
  }
  const zeile = { methode: k.methode, host: zielHost(k.adresse), stufe: tx(`automatisierung.ui.karte.dann.url.inhalt.${k.inhalt}` as never) };
  if (c.trocken) return tx('automatisierung.karte.url.trocken', zeile);
  const neu = await c.aussen.ausleitung.legeUrl(c.automatisierung, { karte: k.id, laufId: c.laufId ?? null, ereignisId: c.ereignisId, adresse, methode: k.methode, rumpf });
  return neu ? tx('automatisierung.karte.url.ergebnis', zeile) : tx('automatisierung.karte.url.schon', zeile);
};

/* ---------- E-Mail senden ---------- */

/** `fuer`: mit wessen Rechten (zusätzlich zu denen des Systemkontos) die Platzhalter gefüllt werden; null = nur Systemkonto. */
interface MailZiel { an: string; fuer: string | null }

/** Adressen hinter einem Eintrag in „An“: Personen mit Konto (aktiv, mit echter Adresse) bzw. Adressen. */
async function adressen(e: MailEmpfaenger, c: KartenKontext): Promise<MailZiel[]> {
  if (e.art === 'adresse') return istEmail(e.adresse) ? [{ an: e.adresse.trim(), fuer: null }] : [];
  if (e.art === 'feld' && c.mappe && istEmailFeld(c.typ?.felder.find((f) => f.key === e.feld))) {
    const v = c.mappe.werte[e.feld];
    // Wer das Feld setzt, bestimmt die Adresse: Platzhalter nicht mit mehr Rechten füllen, als die auslösende Person hat.
    return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && istEmail(x) && !istVerschluesselt(x)).map((x) => ({ an: x.trim(), fuer: c.person }));
  }
  const ids = await c.personen(e as Empfaenger);
  const erg: MailZiel[] = [];
  for (const id of ids) {
    const m = await c.dienst.kern.repo.holeMappe(id);
    const email = typeof m?.werte.email === 'string' ? m.werte.email.trim() : '';
    if (m && m.werte.aktiv !== false && istEmail(email) && !email.endsWith('.invalid')) erg.push({ an: email, fuer: id });
  }
  return erg;
}

/** Alle Adressen der Karte, je Adresse einmal (ohne Groß/klein); ohne Mappe nur Personen, Rollen und Adressen. */
async function empfaengerDerMail(k: DannEmail, c: KartenKontext): Promise<MailZiel[]> {
  const ohneMappe = !c.mappe && (istBetrieb(c.automatisierung.wenn) || istAufruf(c.automatisierung.wenn));
  // Ohne Mappe (Werkbank-Karten, Aufruf von außen) nur Personen, Rollen und Adressen – wie die Prüfung beim Speichern.
  const an = ohneMappe ? k.an.filter((e) => e.art === 'person' || e.art === 'rolle' || e.art === 'adresse') : k.an;
  const ziele = new Map<string, MailZiel>();
  for (const e of an) for (const z of await adressen(e, c)) if (!ziele.has(z.an.toLowerCase())) ziele.set(z.an.toLowerCase(), z);
  if (!ziele.size) {
    if (an.length && an.every((e) => e.art === 'ereignis' || e.art === 'feld')) throw new KarteLeer(tx('automatisierung.karte.email.niemand-leer'));
    throw new Fachfehler(422, tx('automatisierung.karte.email.niemand'));
  }
  if (ziele.size > AUSSEN_GRENZEN.empfaenger) throw new Fachfehler(422, tx('automatisierung.karte.email.zuviele', { anzahl: AUSSEN_GRENZEN.empfaenger }));
  return [...ziele.values()];
}

// eslint-disable-next-line no-control-regex -- Betreff als eine Zeile (keine Kopfzeilen über Platzhalter)
const eineZeile = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, AUSSEN_GRENZEN.betreff);

/** Betreff und Text je Empfänger: Personen mit Konto mit ihren Rechten (#795), Feld-Adressen mit denen der auslösenden Person, feste Adressen mit denen des Systemkontos. */
async function mailFuer(k: DannEmail, z: MailZiel, c: KartenKontext, fuss: string) {
  const fuelle = async (text: string) => (z.fuer ? c.fuelleFuer(text, z.fuer) : { text: await c.fuelle(text), verborgen: 0 });
  const b = await fuelle(k.betreff);
  const x = await fuelle(k.text);
  return { mail: { an: z.an, betreff: eineZeile(b.text) || eineZeile(k.betreff), text: `${x.text.trim()}\n\n-- \n${fuss}\n` }, verborgen: b.verborgen > 0 || x.verborgen > 0 };
}

DANN_AUSFUEHRER.email = async (k: DannKarte, c: KartenKontext) => {
  if (k.art !== 'email') throw new Fachfehler(500, t('meldungen.automatisierungkarten.falsche-karte'));
  if (!c.aussen) throw new Fachfehler(500, tx('automatisierung.karte.url.fehlt'));
  const fuss = tx('automatisierung.karte.email.fuss', { name: c.automatisierung.name, adresse: (c.aussen.basis() || 'Ablago').replace(/\/+$/, '') });
  const mails: Array<{ an: string; betreff: string; text: string }> = [];
  let verborgen = 0;
  for (const z of await empfaengerDerMail(k, c)) {
    const m = await mailFuer(k, z, c, fuss);
    mails.push(m.mail);
    if (m.verborgen) verborgen++;
  }
  if (c.trocken) return [tx('automatisierung.karte.email.trocken', { anzahl: mails.length, betreff: mails[0].betreff }), ...(verborgen ? [tx('automatisierung.karte.email.trocken.nicht-sichtbar', { anzahl: verborgen })] : [])].join(' ');
  const n = await c.aussen.ausleitung.legeMails(c.automatisierung, { karte: k.id, laufId: c.laufId ?? null, ereignisId: c.ereignisId }, mails);
  return n ? tx('automatisierung.karte.email.ergebnis', { anzahl: n }) : tx('automatisierung.karte.email.schon');
};
