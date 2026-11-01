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
  | 'oidc' | 'zweifaktor' | 'paket' | 'pruefwort' | 'sonstige';

/** Wo ein verschlüsselter Wert liegt; `wert` ist der ganze gespeicherte JSON-Wert. */
export interface Fundstelle {
  quelle: 'mappe' | 'papierkorb' | 'einstellung';
  /** Id der Mappe bzw. Schlüssel der Einstellung. */
  schluessel: string;
  wert: unknown;
  /** Titel der Mappe bzw. Name des Benutzers (Zwei-Faktor), soweit bekannt. */
  titel?: string | null;
}

export interface ArtStand { art: GeheimArt; name: string; anzahl: number; unlesbar: number }

/** Namen in der Reihenfolge der Anzeige; `wo` sagt, wo man einen nicht lesbaren Wert neu eingibt. */
export const GEHEIM_ARTEN: Record<GeheimArt, { name: string; bereich: string; wo: string; intern?: true }> = {
  passwortfeld: { name: 'Passwortfelder in Mappen', bereich: 'Ablage', wo: 'in der Ablage neu eingeben' },
  papierkorb: { name: 'Passwortfelder im Papierkorb', bereich: 'Papierkorb', wo: 'nach dem Wiederherstellen in der Ablage neu eingeben' },
  mail: { name: 'E-Mail-Versand (Passwort des Mailservers)', bereich: 'E-Mail und Adresse', wo: 'in der Werkbank unter „E-Mail und Adresse“ neu eingeben' },
  postfach: { name: 'Postfächer (IMAP-Passwort)', bereich: 'Postfächer', wo: 'in der Werkbank unter „Postfächer“ neu eingeben' },
  postfach_oauth_app: { name: 'Postfächer (OAuth: App-Geheimnis)', bereich: 'Postfächer', wo: 'in der Werkbank unter „Postfächer“ bei der App neu eingeben' },
  postfach_oauth: { name: 'Postfächer (OAuth-Anmeldung)', bereich: 'Postfächer', wo: 'in der Werkbank unter „Postfächer“ neu anmelden' },
  oidc: { name: 'Anmeldung über einen Anbieter (OIDC: Client-Secret)', bereich: 'Anmeldeschutz', wo: 'in der Werkbank unter „Anmeldeschutz“ neu eingeben' },
  zweifaktor: { name: 'Zwei-Faktor-Anmeldung', bereich: 'Benutzer', wo: 'unter „Benutzer“ zurücksetzen; der Benutzer richtet sie neu ein' },
  paket: { name: 'Paket-Einstellungen (Geheimnisse)', bereich: 'Pakete', wo: 'in den Einstellungen des Pakets neu eingeben' },
  pruefwort: { name: 'Prüfwort (zeigt, ob der Schlüssel passt)', bereich: 'Verschlüsselung', wo: 'wird mit einem neuen Schlüssel neu gesetzt', intern: true },
  sonstige: { name: 'Weitere Einstellungen', bereich: 'Einstellungen', wo: 'bitte melden – diese Art kennt die Anzeige noch nicht' },
};

/** Art eines Fundes nach Quelle und Schlüssel der Einstellung. */
export function artVon(f: Pick<Fundstelle, 'quelle' | 'schluessel'>): GeheimArt {
  if (f.quelle === 'mappe') return 'passwortfeld';
  if (f.quelle === 'papierkorb') return 'papierkorb';
  const k = f.schluessel;
  if (k === 'mail') return 'mail';
  if (k === 'postfaecher') return 'postfach';
  if (k === 'postfach_oauth_apps') return 'postfach_oauth_app';
  if (k.startsWith('postfach_oauth_')) return 'postfach_oauth';
  if (k === 'oidc') return 'oidc';
  if (k.startsWith('zweifaktor_') && k !== 'zweifaktor_pflicht' && k !== 'zweifaktor_pflicht_seit') return 'zweifaktor';
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
      if (art === 'papierkorb') was = `${f.titel || 'Mappe ohne Titel'}: ${String(w.pfad.at(-1) ?? 'Passwort')}`;
      else if (art === 'postfach') was = `Postfach „${(Array.isArray(f.wert) && typeof w.pfad[0] === 'number' ? name(f.wert[w.pfad[0]]) : '') || 'ohne Namen'}“: Passwort`;
      else if (art === 'postfach_oauth_app') was = `App für ${String(w.pfad[0] ?? 'OAuth')}: Client-Secret`;
      else if (art === 'postfach_oauth') was = `Postfach „${postfachName(f.schluessel.slice('postfach_oauth_'.length)) || 'ohne Namen'}“: Anmeldung beim Anbieter`;
      else if (art === 'oidc') was = 'Client-Secret des Anbieters';
      else if (art === 'zweifaktor') was = `Zwei-Faktor-Anmeldung von ${f.titel || 'einem Benutzer'}`;
      else if (art === 'paket') was = `Paket „${f.schluessel.slice('paket:'.length)}“: ${String(w.pfad.filter((x) => typeof x === 'string' && x !== 'werte').join('.') || 'Geheimnis')}`;
      else if (art === 'mail') was = 'Passwort des Mailservers';
      else if (art === 'passwortfeld') was = `${f.titel || 'Mappe ohne Titel'}: ${String(w.pfad.at(-1) ?? 'Passwort')}`;
      else was = `Einstellung „${f.schluessel}“`;
      betroffen.push({ bereich: a.bereich, was, wo: a.wo });
    }
  }
  const arten = (Object.keys(GEHEIM_ARTEN) as GeheimArt[])
    .filter((art) => !GEHEIM_ARTEN[art].intern && (art !== 'sonstige' || zahl.get(art)?.anzahl))
    .map((art) => ({ art, name: GEHEIM_ARTEN[art].name, anzahl: zahl.get(art)?.anzahl ?? 0, unlesbar: zahl.get(art)?.unlesbar ?? 0 }));
  return { arten, betroffen };
}
