import { notfallblattPdf } from './pdf';
import { ohneZugangsdaten } from './sicherung';
import { t } from './sprache';
import { NOTFALL_HILFE, NOTFALL_HILFE_EN, NOTFALL_QR } from './notfallqr';
import { zeitzone } from '../../shared/src/region';
import { notfallcodeInGruppen } from '../../shared/src/notfallcode';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Notfallblatt (#106, neu gestaltet mit #814): eine Seite A4 in Ablago-Optik, auch in Schwarzweiß lesbar.
 * Der Schlüssel steht nur hier (und in der Schlüsseldatei), nie in einer Sicherung – und nie als QR-Code.
 *
 * Aufbau: Kopf mit Logo, Name der Ablage, Datum und Version · Schlüssel groß mit Lesehilfe und Fingerabdruck ·
 * Diese Ablage (Adresse, Ablage-Id, wo die Sicherungen liegen, Adressen für Aufrufe von außen #679) · Wen fragen? · Etwas ist passiert? mit Links
 * (immer https://) und QR-Code zur Hilfeseite, darin der Notfallcode für „Ich komme nicht mehr hinein“ (#815). Keine Pfade oder Dateinamen aus Docker oder vom NAS: Die
 * ausführliche Anleitung steht im Handbuch.
 *
 * `notfallblattPlan` stellt alle Texte zusammen (prüfbar ohne PDF); gezeichnet wird in der PDF-Stelle
 * (`pdf/notfallblatt.ts`, im Arbeiter).
 */

export interface Notfalldaten {
  name: string;
  haushaltId: string;
  adresse: string;
  version: string;
  erstellt: Date;
  /** Schlüssel als Text (base64url, 43 Zeichen). */
  schluessel: string;
  fingerabdruck: string;
  /** Kopie außer Haus (#585): Paket und Adresse des Ziels – nie Zugangsdaten. */
  aussenziele?: Array<{ name: string; adresse: string | null; ziel?: string | null }>;
  /** Notfallkontakte (#812): Name, wie erreichbar (Telefon, E-Mail) und die Notiz. Ohne: Zeilen zum Eintragen. */
  kontakte?: Array<{ name: string; erreichbar: string; notiz?: string }>;
  /** Notfallcode (#815): öffnet `<adresse>/notfall`, gilt einmal. Gespeichert ist nur sein Hash – er steht nur hier. */
  notfallcode?: string;
  /** Aufruf von außen (#679): Adressen, die gerade Aufrufe annehmen – Name und Adresse (nie das Geheimnis). */
  aufrufe?: Array<{ name: string; adresse: string }>;
}

/** So viele Adressen nennt das Blatt einzeln (eine Seite); die übrigen als „und N weitere“. */
const AUFRUFE_AUF_DEM_BLATT = 5;

/**
 * Aufrufe von außen (#679) auf dem Blatt: „Name (…/api/aufruf/AbCdEfGh…)“ – die Kennung gekürzt (wiedererkennbar, und
 * die Zeile bleibt kurz); ohne Geheimnis ist die Adresse ohnehin wertlos.
 */
export function aufrufZeile(liste: Array<{ name: string; adresse: string }>): string {
  const kurz = (a: string) => { const i = a.indexOf('/api/aufruf/'); return i < 0 ? a : `…${a.slice(i, i + '/api/aufruf/'.length + 8)}…`; };
  const teile = liste.slice(0, AUFRUFE_AUF_DEM_BLATT).map((x) => `${x.name} (${kurz(x.adresse)})`);
  if (liste.length > AUFRUFE_AUF_DEM_BLATT) teile.push(t('werkbank.notfallblatt.ablage.aufrufe.weitere', { anzahl: liste.length - AUFRUFE_AUF_DEM_BLATT }));
  return t('werkbank.notfallblatt.ablage.aufrufe.text', { liste: teile.join(', ') });
}

/** In Vierergruppen, gut abschreibbar; Leerzeichen zählen bei der Eingabe nicht. */
export const inGruppen = (s: string) => s.match(/.{1,4}/g)!.join(' ');

/** Zeichen, die man vom Papier leicht verwechselt, und was darunter steht (Schlüssel: A–Z, a–z, 0–9, - und _). */
export const VERWECHSELBAR: Readonly<Record<string, string>> = {
  '0': 'null', O: 'gross-o', o: 'klein-o', l: 'klein-l', I: 'gross-i', '1': 'eins', '-': 'minus', _: 'unterstrich',
};
export const lesehilfe = (z: string): string | null => (VERWECHSELBAR[z] ? t.frei(`werkbank.notfallblatt.zeichen.${VERWECHSELBAR[z]}`) : null);

/**
 * Eine Adresse für das Blatt: https als Link; alles andere ohne „http://“ davor und nicht klickbar – auf dem
 * Blatt steht nie http:// (#814). Zugangsdaten in der Adresse fallen immer weg.
 */
export function blattAdresse(a: string): { text: string; link?: string } {
  const sauber = ohneZugangsdaten(a.trim());
  if (/^https:\/\//i.test(sauber)) return { text: sauber, link: sauber };
  return { text: sauber.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') };
}

export interface NotfallblattPlan {
  dokumenttitel: string;
  kopf: { titel: string; name: string; unter: string };
  einleitung: string;
  schluessel: { titel: string; gruppen: Array<Array<{ zeichen: string; hilfe: string | null }>>; hinweis: string; fingerabdruckTitel: string; fingerabdruck: string; fingerabdruckHinweis: string };
  ablage: { titel: string; zeilen: Array<{ marke: string; text: string; link?: string; mono?: boolean }>; warnung: string | null };
  /** `seite2`: Verweis, wenn die Kontakte auf eine zweite Seite ausweichen (#812). */
  fragen: { titel: string; kontakte: Array<{ name: string; erreichbar: string; notiz?: string }>; leer: string | null; seite2: string };
  hilfe: { titel: string; text: string; links: Array<{ marke: string; url: string }>; qr: readonly string[]; qrText: string; handbuch: string };
  /** Ausgesperrt? Notfallcode und wo man ihn eingibt (#815); null ohne Code. */
  notfall: { titel: string; code: string; text: string; adresse: { text: string; link?: string } | null; hinweis: string } | null;
  fuss: string;
}

export function notfallblattPlan(d: Notfalldaten): NotfallblattPlan {
  const datum = d.erstellt.toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'long', timeStyle: 'short' });
  const kurz = d.erstellt.toLocaleDateString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'medium' });
  const ziele = (d.aussenziele ?? []).map((z) => {
    const ort = z.adresse ? blattAdresse(z.adresse).text : z.ziel ? blattAdresse(z.ziel).text : null;
    return ort ? `${z.name} (${ort})` : z.name;
  });
  const adresse = d.adresse ? blattAdresse(d.adresse) : null;
  return {
    dokumenttitel: `${t('werkbank.notfallblatt.titel')} ${d.name}`,
    kopf: { titel: t('werkbank.notfallblatt.titel'), name: d.name, unter: t('werkbank.notfallblatt.erstellt', { datum, version: d.version }) },
    einleitung: t('werkbank.notfallblatt.einleitung'),
    schluessel: {
      titel: t('werkbank.notfallblatt.schluessel'),
      gruppen: inGruppen(d.schluessel).split(' ').map((g) => [...g].map((zeichen) => ({ zeichen, hilfe: lesehilfe(zeichen) }))),
      hinweis: t('werkbank.notfallblatt.schluessel.hinweis'),
      fingerabdruckTitel: t('werkbank.notfallblatt.fingerabdruck'),
      fingerabdruck: d.fingerabdruck,
      fingerabdruckHinweis: t('werkbank.notfallblatt.fingerabdruck.hinweis'),
    },
    ablage: {
      titel: t('werkbank.notfallblatt.ablage'),
      zeilen: [
        { marke: t('werkbank.notfallblatt.ablage.adresse'), ...(adresse ?? { text: t('werkbank.notfallblatt.ablage.adresse.keine') }) },
        { marke: t('werkbank.notfallblatt.ablage.id'), text: d.haushaltId, mono: true },
        { marke: t('werkbank.notfallblatt.ablage.sicherungen'), text: ziele.length ? t('werkbank.notfallblatt.ablage.sicherungen.aussen', { ziele: ziele.join(', ') }) : t('werkbank.notfallblatt.ablage.sicherungen.text') },
        // Aufruf von außen (#679): „diese Adressen nehmen Aufrufe an“ – nur, wenn es welche gibt.
        ...(d.aufrufe?.length ? [{ marke: t('werkbank.notfallblatt.ablage.aufrufe'), text: aufrufZeile(d.aufrufe) }] : []),
      ],
      warnung: ziele.length ? t('werkbank.notfallblatt.ablage.aussen.warnung') : null,
    },
    fragen: { titel: t('werkbank.notfallblatt.fragen'), kontakte: d.kontakte ?? [], leer: d.kontakte?.length ? null : t('werkbank.notfallblatt.fragen.leer'), seite2: t('werkbank.notfallblatt.fragen.seite2') },
    hilfe: {
      titel: t('werkbank.notfallblatt.passiert'),
      text: t('werkbank.notfallblatt.passiert.text'),
      links: [{ marke: t('werkbank.notfallblatt.passiert.deutsch'), url: NOTFALL_HILFE }, { marke: t('werkbank.notfallblatt.passiert.englisch'), url: NOTFALL_HILFE_EN }],
      qr: NOTFALL_QR,
      qrText: t('werkbank.notfallblatt.passiert.qr'),
      handbuch: t('werkbank.notfallblatt.passiert.handbuch'),
    },
    notfall: d.notfallcode ? {
      titel: t('werkbank.notfallblatt.notfallcode'),
      code: notfallcodeInGruppen(d.notfallcode),
      text: adresse ? t('werkbank.notfallblatt.notfallcode.text') : t('werkbank.notfallblatt.notfallcode.ohne-adresse'),
      adresse: adresse ? { text: `${adresse.text.replace(/\/+$/, '')}/notfall`, ...(adresse.link ? { link: `${adresse.link.replace(/\/+$/, '')}/notfall` } : {}) } : null,
      hinweis: t('werkbank.notfallblatt.notfallcode.hinweis'),
    } : null,
    fuss: t('werkbank.notfallblatt.fuss', { name: d.name, datum: kurz }),
  };
}

/** Das Notfallblatt als PDF (eine Seite A4), gezeichnet im Arbeiter. */
export async function notfallblatt(d: Notfalldaten): Promise<Buffer> {
  return Buffer.from(await notfallblattPdf(notfallblattPlan(d)));
}
