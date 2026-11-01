/**
 * WebDAV-Laufwerk (#346, Stufe 1): reine Hilfen ohne Datenbank und ohne HTTP – Namen bereinigen und
 * eindeutig machen, Pfade zerlegen, XML erzeugen, Ratenbegrenzung. Die Anbindung steht in webdav.ts.
 */

/** Wurzel des Laufwerks. */
export const WEBDAV_PFAD = '/webdav';
/** Ordner der obersten Ebene. */
export const NEUE_POST = 'Neue Post';
export const ABLAGE = 'Ablage';
/** Ordner je Mappe mit den verknüpften Mappen (nur eine Ebene tief, s. webdav.ts). */
export const VERKNUEPFT = 'Verknüpft';

/** Zeichen, die Windows, macOS oder iOS in Datei- und Ordnernamen nicht mögen. */
// eslint-disable-next-line no-control-regex
const VERBOTEN = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
/** Unter Windows reservierte Namen (auch mit Endung). */
const RESERVIERT = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const MAX_NAME = 120;

/** Vergleichsschlüssel: Unicode-NFC (macOS schickt Umlaute zerlegt) und ohne Groß-/Kleinschreibung (Windows). */
export const schluessel = (name: string) => name.normalize('NFC').toLowerCase();

/** Ein Name, den alle Systeme als Datei- oder Ordnernamen annehmen. */
export function bereinige(name: string, ersatz = 'Ohne Titel'): string {
  let s = String(name ?? '').normalize('NFC').replace(VERBOTEN, '_').replace(/\s+/g, ' ').trim();
  // Endpunkte und Leerzeichen am Ende verträgt Windows nicht.
  s = s.replace(/[. ]+$/, '');
  // Mit Punkt beginnende Namen wären auf macOS/Linux unsichtbar – und könnten wie Hilfsdateien aussehen.
  s = s.replace(/^[.]+/, '');
  if (s.length > MAX_NAME) {
    const punkt = s.lastIndexOf('.');
    const endung = punkt > 0 && s.length - punkt <= 10 ? s.slice(punkt) : '';
    s = s.slice(0, MAX_NAME - endung.length).replace(/[. ]+$/, '') + endung;
  }
  if (!s) s = ersatz;
  if (RESERVIERT.test(s)) s = `_${s}`;
  return s;
}

/** Hilfsdateien der Betriebssysteme: beim Ablegen still verwerfen, beim Abrufen „gibt es nicht“. */
export function istHilfsdatei(name: string): boolean {
  const n = schluessel(name);
  return n === 'desktop.ini' || n === 'thumbs.db' || n === '.ds_store' || n.startsWith('._') || n.startsWith('~$')
    || n === '.localized' || n === 'folder.jpg' || n === 'albumart.jpg' || n.startsWith('.~lock.') || n === '.hidden'
    || n === 'autorun.inf' || n === '.metadata_never_index' || n === '.metadata_never_index_unless_rootfs'
    || n === '.ql_disablethumbnails' || n === '.ql_disablecache' || n === '.trashes' || n === '.spotlight-v100' || n === '.fseventsd';
}

export interface Benennbar {
  /** Gewünschter Name (wird bereinigt). */
  name: string;
  /** Kurze, feste Kennung für Duplikate (z. B. Anfang der Id) – macht den Namen stabil. Ohne: Zähler „(2)“. */
  kurz?: string;
  /** Dateiname: Zusatz vor der Endung einfügen. */
  datei?: boolean;
}

function mitZusatz(name: string, zusatz: string, datei?: boolean) {
  const punkt = datei ? name.lastIndexOf('.') : -1;
  return punkt > 0 ? `${name.slice(0, punkt)} (${zusatz})${name.slice(punkt)}` : `${name} (${zusatz})`;
}

/**
 * Eindeutige Namen in einem Ordner (ohne Groß-/Kleinschreibung). Bei Duplikaten bekommt jeder Eintrag
 * mit Kennung „Name (kurz)“, sonst „Name (2)“, „Name (3)“ … in der gegebenen Reihenfolge. `belegt`:
 * Namen, die schon vergeben sind (z. B. „Verknüpft“). Liefert die Namen in derselben Reihenfolge.
 */
export function eindeutig(eintraege: Benennbar[], belegt: string[] = []): string[] {
  const basis = eintraege.map((e) => bereinige(e.name, e.datei ? 'Dokument' : 'Ohne Titel'));
  const anzahl = new Map<string, number>();
  for (const b of basis) anzahl.set(schluessel(b), (anzahl.get(schluessel(b)) ?? 0) + 1);
  const vergeben = new Set(belegt.map(schluessel));
  return basis.map((b, i) => {
    const e = eintraege[i];
    const doppelt = (anzahl.get(schluessel(b)) ?? 0) > 1 || vergeben.has(schluessel(b));
    let name = doppelt && e.kurz ? mitZusatz(b, e.kurz, e.datei) : b;
    for (let n = 2; vergeben.has(schluessel(name)); n++) name = mitZusatz(b, e.kurz && n === 2 ? e.kurz : String(n), e.datei);
    vergeben.add(schluessel(name));
    return name;
  });
}

/** Kurzkennung aus einer Id (UUID): sechs Zeichen, stabil. */
export const kurzId = (id: string) => id.replace(/-/g, '').slice(0, 6);

/**
 * Pfad einer Anfrage unterhalb von /webdav in Namen zerlegen (dekodiert, NFC). `null`, wenn der Pfad
 * nicht unter /webdav liegt oder unzulässig ist (kaputte Kodierung, „..“, Nullbytes).
 */
export function zerlege(url: string): { teile: string[]; ordner: boolean } | null {
  const pfad = url.split('?')[0].split('#')[0];
  if (pfad !== WEBDAV_PFAD && !pfad.startsWith(`${WEBDAV_PFAD}/`)) return null;
  const rest = pfad.slice(WEBDAV_PFAD.length);
  const teile: string[] = [];
  for (const roh of rest.split('/')) {
    if (!roh) continue;
    let t: string;
    try { t = decodeURIComponent(roh); } catch { return null; }
    if (t === '.' || t === '..' || t.includes('/') || t.includes('\\') || t.includes('\0')) return null;
    teile.push(t.normalize('NFC'));
  }
  if (teile.length > 12) return null;
  return { teile, ordner: rest.endsWith('/') || teile.length === 0 };
}

/** Href für eine Antwort: jeder Teil kodiert, Ordner mit Schrägstrich am Ende. */
export function href(teile: string[], ordner: boolean): string {
  const p = `${WEBDAV_PFAD}/${teile.map((t) => encodeURIComponent(t)).join('/')}`;
  return ordner ? (p.endsWith('/') ? p : `${p}/`) : p;
}

/** Text für XML (Inhalt und Attribute). Zeichen, die XML 1.0 nicht erlaubt, fallen weg. */
export function xml(s: string): string {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Datum im HTTP-Format (RFC 1123), z. B. für getlastmodified und Last-Modified. */
export function httpDatum(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : new Date(t).toUTCString();
}

export interface Eintrag {
  teile: string[];
  ordner: boolean;
  name: string;
  groesse?: number;
  mime?: string;
  etag?: string;
  geaendert?: string;
  erstellt?: string;
}

const SPERRBAR = '<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>';

/** Eine Antwort auf PROPFIND (immer alle Eigenschaften, wie „allprop“). */
export function multistatus(eintraege: Eintrag[]): string {
  const teile = eintraege.map((e) => {
    const p: string[] = [`<D:displayname>${xml(e.name)}</D:displayname>`];
    p.push(e.ordner ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>');
    const geaendert = httpDatum(e.geaendert);
    if (geaendert) p.push(`<D:getlastmodified>${geaendert}</D:getlastmodified>`);
    const erstellt = e.erstellt && !Number.isNaN(Date.parse(e.erstellt)) ? new Date(e.erstellt).toISOString() : undefined;
    if (erstellt) p.push(`<D:creationdate>${erstellt}</D:creationdate>`);
    if (!e.ordner) {
      p.push(`<D:getcontentlength>${Math.max(0, Math.floor(e.groesse ?? 0))}</D:getcontentlength>`);
      p.push(`<D:getcontenttype>${xml(e.mime ?? 'application/octet-stream')}</D:getcontenttype>`);
      if (e.etag) p.push(`<D:getetag>${xml(e.etag)}</D:getetag>`);
    }
    p.push(SPERRBAR, '<D:lockdiscovery/>');
    return `<D:response><D:href>${xml(href(e.teile, e.ordner))}</D:href><D:propstat><D:prop>${p.join('')}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${teile.join('')}</D:multistatus>`;
}

/** Fehlerkörper nach RFC 4918 (z. B. propfind-finite-depth). */
export function davFehler(bedingung: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:error xmlns:D="DAV:"><D:${bedingung}/></D:error>`;
}

/** Namen der Eigenschaften aus einem PROPPATCH-Körper (nur grob, höchstens 50) samt Namensraum. */
export function proppatchNamen(text: string): Array<{ ns: string; name: string }> {
  const ns = new Map<string, string>();
  let standard = '';
  for (const m of text.matchAll(/xmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/g)) { if (m[1]) ns.set(m[1], m[2]); else standard = m[2]; }
  const erg: Array<{ ns: string; name: string }> = [];
  // Linear: jedes Tag einzeln lesen (kein verschachtelter regulärer Ausdruck); nur Kinder von <prop> zählen.
  let tiefeProp = 0;
  for (const t of text.matchAll(/<([^<>]*)>/g)) {
    const inhalt = t[1].trim();
    if (!inhalt || inhalt[0] === '?' || inhalt[0] === '!') continue;
    const schliessend = inhalt[0] === '/';
    const leer = inhalt.endsWith('/');
    const kern = (schliessend ? inhalt.slice(1) : leer ? inhalt.slice(0, -1) : inhalt).trim();
    const ende = kern.search(/\s/);
    const qname = ende < 0 ? kern : kern.slice(0, ende);
    const doppel = qname.indexOf(':');
    const praefix = doppel < 0 ? '' : qname.slice(0, doppel);
    const name = doppel < 0 ? qname : qname.slice(doppel + 1);
    if (!/^[\w.-]+$/.test(name) || (praefix && !/^[\w.-]+$/.test(praefix))) continue;
    if (name === 'prop') {
      if (schliessend) tiefeProp = Math.max(0, tiefeProp - 1); else if (!leer) tiefeProp++;
      continue;
    }
    if (schliessend || tiefeProp === 0) continue;
    if (erg.length >= 50) break;
    const n = praefix ? ns.get(praefix) ?? '' : standard;
    if (!erg.some((x) => x.ns === n && x.name === name)) erg.push({ ns: n, name });
  }
  return erg;
}

/** Antwort auf PROPPATCH: Eigenschaften werden nicht gespeichert – jede mit 403 (wie ein Server ohne eigene Eigenschaften). */
export function proppatchAntwort(teile: string[], ordner: boolean, namen: Array<{ ns: string; name: string }>): string {
  const props = namen.map((p, i) => (p.ns === 'DAV:' ? `<D:${p.name}/>` : `<x${i}:${p.name} xmlns:x${i}="${xml(p.ns)}"/>`)).join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:"><D:response><D:href>${xml(href(teile, ordner))}</D:href>${
    props ? `<D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 403 Forbidden</D:status></D:propstat>` : ''
  }</D:response></D:multistatus>`;
}

/** Antwort auf LOCK: Schein-Sperre (Stufe 1 setzt sie nicht durch, s. webdav.ts). */
export function sperrAntwort(token: string, teile: string[], ordner: boolean, sekunden: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>`
    + '<D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>0</D:depth>'
    + `<D:timeout>Second-${sekunden}</D:timeout><D:locktoken><D:href>${xml(token)}</D:href></D:locktoken>`
    + `<D:lockroot><D:href>${xml(href(teile, ordner))}</D:href></D:lockroot></D:activelock></D:lockdiscovery></D:prop>`;
}

/** Benutzername und Passwort aus „Authorization: Basic …“; sonst undefined. */
export function basic(kopf: string | undefined): { name: string; passwort: string } | undefined {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(kopf ?? '');
  if (!m) return undefined;
  const text = Buffer.from(m[1], 'base64').toString('utf8');
  const i = text.indexOf(':');
  if (i < 0) return undefined;
  return { name: text.slice(0, i).trim(), passwort: text.slice(i + 1) };
}

/** Einfache Ratenbegrenzung im Speicher: höchstens `grenze` Anfragen je Schlüssel und Minute (festes Fenster). */
export class Ratenbegrenzung {
  private fenster = new Map<string, { start: number; anzahl: number }>();
  constructor(public grenze: number, private jetzt: () => number = Date.now, private dauer = 60_000) {}
  /** true: Anfrage erlaubt. Liefert sonst die Sekunden bis zum nächsten Fenster. */
  pruefe(k: string): { ok: true } | { ok: false; sekunden: number; erstes: boolean } {
    const t = this.jetzt();
    let f = this.fenster.get(k);
    if (!f || t - f.start >= this.dauer) {
      f = { start: t, anzahl: 0 };
      this.fenster.set(k, f);
      if (this.fenster.size > 10_000) for (const [x, v] of this.fenster) if (t - v.start >= this.dauer) this.fenster.delete(x);
    }
    f.anzahl++;
    if (f.anzahl <= this.grenze) return { ok: true };
    return { ok: false, sekunden: Math.max(1, Math.ceil((f.start + this.dauer - t) / 1000)), erstes: f.anzahl === this.grenze + 1 };
  }
}
