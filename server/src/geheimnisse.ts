import { t } from './sprache';
/** Wie in tresor.ts (dort importiert diese Datei – daher kein Import zurück). */
export interface Betroffen { bereich: string; was: string; wo?: string }
const istVerschluesselt = (v: unknown): v is string => typeof v === 'string' && v.startsWith('dms1$');

/**
 * Welche Geheimnisse das DMS verschlüsselt speichert (#410) – vollständig, mit Anzahl je Art.
 *
 * Grundlage ist dieselbe Suche, die auch der Schlüsselwechsel umschlüsselt (Repo:
 * `verschluesselteFundstellen` ↔ `umschluesseln`): jeder Wert „dms1$…“ in Mappen, Papierkorb und
 * Einstellungen. Was hier gezählt wird, wird also auch mitgenommen – und eine neue Art, die noch
 * keinen Namen hat, erscheint als „Weitere Einstellungen“ statt zu fehlen.
 */

export type GeheimArt =
  | 'passwortfeld' | 'papierkorb' | 'mail' | 'postfach' | 'postfach_oauth_app' | 'postfach_oauth'
  | 'oidc' | 'zweifaktor' | 'dokpasswort' | 'paket' | 'aufruf' | 'aussen' | 'pruefwort' | 'sonstige';

/** Wo ein verschlüsselter Wert liegt; `wert` ist der ganze gespeicherte JSON-Wert. */
export interface Fundstelle {
  quelle: 'mappe' | 'papierkorb' | 'einstellung' | 'aufruf' | 'aussen';
  /** Id der Mappe bzw. Schlüssel der Einstellung bzw. Id der Automatisierung (Aufruf von außen #679, URL aufrufen #671). */
  schluessel: string;
  wert: unknown;
  /** Titel der Mappe bzw. Name des Benutzers (Zwei-Faktor) bzw. der Automatisierung, soweit bekannt. */
  titel?: string | null;
}

export interface ArtStand { art: GeheimArt; name: string; anzahl: number; unlesbar: number }

/** Namen in der Reihenfolge der Anzeige; `wo` sagt, wo man einen nicht lesbaren Wert neu eingibt. */
export const GEHEIM_ARTEN: Record<GeheimArt, { name: string; bereich: string; wo: string; intern?: true }> = {
  passwortfeld: { name: t('meldungen.geheimnisse.passwortfelder-in-mappen'), bereich: 'Ablage', wo: t('meldungen.geheimnisse.in-der-ablage-neu') },
  papierkorb: { name: t('meldungen.geheimnisse.passwortfelder-im-papierkorb'), bereich: 'Papierkorb', wo: t('meldungen.geheimnisse.nach-dem-wiederherstellen-in') },
  mail: { name: t('meldungen.geheimnisse.e-mail-versand-passwort'), bereich: t('meldungen.geheimnisse.e-mail-und-adresse'), wo: t('meldungen.geheimnisse.in-der-werkbank-unter') },
  postfach: { name: t('meldungen.geheimnisse.postfaecher-imap-passwort'), bereich: 'Postfächer', wo: t('meldungen.geheimnisse.in-der-werkbank-unter-2') },
  postfach_oauth_app: { name: t('meldungen.geheimnisse.postfaecher-oauth-app-geheimnis'), bereich: 'Postfächer', wo: t('meldungen.geheimnisse.in-der-werkbank-unter-3') },
  postfach_oauth: { name: t('meldungen.geheimnisse.postfaecher-oauth-anmeldung'), bereich: 'Postfächer', wo: t('meldungen.geheimnisse.in-der-werkbank-unter-4') },
  oidc: { name: t('meldungen.geheimnisse.anmeldung-ueber-einen-anbieter'), bereich: 'Anmeldeschutz', wo: t('meldungen.geheimnisse.in-der-werkbank-unter-5') },
  zweifaktor: { name: t('meldungen.geheimnisse.zwei-faktor-anmeldung'), bereich: 'Benutzer', wo: t('meldungen.geheimnisse.unter-benutzer-zuruecksetzen-der') },
  dokpasswort: { name: t('meldungen.geheimnisse.gemerkte-passwoerter-fuer-dokumente'), bereich: 'Benutzer', wo: t('meldungen.geheimnisse.der-benutzer-loescht-sie') },
  paket: { name: t('meldungen.geheimnisse.paket-einstellungen-geheimnisse'), bereich: 'Pakete', wo: t('meldungen.geheimnisse.in-den-einstellungen-des') },
  aufruf: { name: t('meldungen.geheimnisse.aufruf'), bereich: 'Automatisierungen', wo: t('meldungen.geheimnisse.aufruf.wo') },
  aussen: { name: t('meldungen.geheimnisse.aussen'), bereich: 'Automatisierungen', wo: t('meldungen.geheimnisse.aussen.wo') },
  pruefwort: { name: t('meldungen.geheimnisse.pruefwort-zeigt-ob-der'), bereich: 'Verschlüsselung', wo: t('meldungen.geheimnisse.wird-mit-einem-neuen'), intern: true },
  sonstige: { name: t('meldungen.geheimnisse.weitere-einstellungen'), bereich: 'Einstellungen', wo: t('meldungen.geheimnisse.bitte-melden-diese-art') },
};

/** Art eines Fundes nach Quelle und Schlüssel der Einstellung. */
export function artVon(f: Pick<Fundstelle, 'quelle' | 'schluessel'>): GeheimArt {
  if (f.quelle === 'mappe') return 'passwortfeld';
  if (f.quelle === 'papierkorb') return 'papierkorb';
  if (f.quelle === 'aufruf') return 'aufruf';
  if (f.quelle === 'aussen') return 'aussen';
  const k = f.schluessel;
  if (k === 'mail') return 'mail';
  if (k === 'postfaecher') return 'postfach';
  if (k === 'postfach_oauth_apps') return 'postfach_oauth_app';
  if (k.startsWith('postfach_oauth_')) return 'postfach_oauth';
  if (k === 'oidc') return 'oidc';
  if (k.startsWith('zweifaktor_') && k !== 'zweifaktor_pflicht' && k !== 'zweifaktor_pflicht_seit') return 'zweifaktor';
  if (k.startsWith('dokpasswoerter_')) return 'dokpasswort';
  if (k.startsWith('paket:')) return 'paket';
  if (k === 'pruefwort') return 'pruefwort';
  return 'sonstige';
}

/** Alle verschlüsselten Werte in einem JSON-Wert, mit Pfad (für Listen wie die Postfächer). */
export function verschluesselteIn(wert: unknown, pfad: Array<string | number> = []): Array<{ pfad: Array<string | number>; wert: string }> {
  if (istVerschluesselt(wert)) return [{ pfad, wert }];
  if (Array.isArray(wert)) return wert.flatMap((x, i) => verschluesselteIn(x, [...pfad, i]));
  if (wert && typeof wert === 'object') return Object.entries(wert).flatMap(([k, x]) => verschluesselteIn(x, [...pfad, k]));
  return [];
}

const name = (x: unknown) => (x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' ? (x as { name: string }).name : '');

/**
 * Bestand je Art (immer alle bekannten Arten, auch mit 0; „Weitere“ nur, wenn es welche gibt) und die
 * nicht lesbaren Werte als Liste. `ohneListe`: Arten, deren nicht lesbare Werte ein anderer Bereich
 * schon genauer meldet (Passwortfelder mit Feldnamen, Mailserver auch „unverschlüsselt“).
 */
export function bestandAus(funde: Fundstelle[], lesbar: (v: string) => boolean, ohneListe: ReadonlySet<GeheimArt> = new Set()): { arten: ArtStand[]; betroffen: Betroffen[] } {
  const zahl = new Map<GeheimArt, { anzahl: number; unlesbar: number }>();
  const betroffen: Betroffen[] = [];
  const postfaecher = funde.find((f) => f.quelle === 'einstellung' && f.schluessel === 'postfaecher')?.wert;
  const postfachName = (id: string) => (Array.isArray(postfaecher) ? name(postfaecher.find((p) => p && typeof p === 'object' && (p as { id?: unknown }).id === id)) : '');
  for (const f of funde) {
    const art = artVon(f);
    const z = zahl.get(art) ?? { anzahl: 0, unlesbar: 0 };
    zahl.set(art, z);
    for (const w of verschluesselteIn(f.wert)) {
      z.anzahl++;
      if (lesbar(w.wert)) continue;
      z.unlesbar++;
      if (ohneListe.has(art) || GEHEIM_ARTEN[art].intern) continue;
      const a = GEHEIM_ARTEN[art];
      let was: string;
      if (art === 'papierkorb') was = `${f.titel || t('meldungen.geheimnisse.mappe-ohne-titel')}: ${String(w.pfad.at(-1) ?? 'Passwort')}`;
      else if (art === 'postfach') was = t('meldungen.geheimnisse.postfach-passwort', { wert: (Array.isArray(f.wert) && typeof w.pfad[0] === 'number' ? name(f.wert[w.pfad[0]]) : '') || t('meldungen.geheimnisse.ohne-namen') });
      else if (art === 'postfach_oauth_app') was = t('meldungen.geheimnisse.app-fuer-client-secret', { wert: String(w.pfad[0] ?? 'OAuth') });
      else if (art === 'postfach_oauth') was = t('meldungen.geheimnisse.postfach-anmeldung-beim-anbieter', { wert: postfachName(f.schluessel.slice('postfach_oauth_'.length)) || t('meldungen.geheimnisse.ohne-namen') });
      else if (art === 'oidc') was = t('meldungen.geheimnisse.client-secret-des-anbieters');
      else if (art === 'zweifaktor') was = t('meldungen.geheimnisse.zwei-faktor-anmeldung-von', { wert: f.titel || t('meldungen.geheimnisse.einem-benutzer') });
      else if (art === 'dokpasswort') was = t('meldungen.geheimnisse.gemerktes-passwort-fuer-dokumente', { wert: f.titel || t('meldungen.geheimnisse.einem-benutzer') });
      else if (art === 'paket') was = `Paket „${f.schluessel.slice('paket:'.length)}“: ${String(w.pfad.filter((x) => typeof x === 'string' && x !== 'werte').join('.') || 'Geheimnis')}`;
      else if (art === 'aufruf') was = t('meldungen.geheimnisse.aufruf.was', { wert: f.titel || t('meldungen.geheimnisse.ohne-namen') });
      else if (art === 'aussen') was = t('meldungen.geheimnisse.aussen.was', { wert: f.titel || t('meldungen.geheimnisse.ohne-namen') });
      else if (art === 'mail') was = t('meldungen.geheimnisse.passwort-des-mailservers');
      else if (art === 'passwortfeld') was = `${f.titel || t('meldungen.geheimnisse.mappe-ohne-titel')}: ${String(w.pfad.at(-1) ?? 'Passwort')}`;
      else was = `Einstellung „${f.schluessel}“`;
      betroffen.push({ bereich: a.bereich, was, wo: a.wo });
    }
  }
  const arten = (Object.keys(GEHEIM_ARTEN) as GeheimArt[])
    .filter((art) => !GEHEIM_ARTEN[art].intern && (art !== 'sonstige' || zahl.get(art)?.anzahl))
    .map((art) => ({ art, name: GEHEIM_ARTEN[art].name, anzahl: zahl.get(art)?.anzahl ?? 0, unlesbar: zahl.get(art)?.unlesbar ?? 0 }));
  return { arten, betroffen };
}
