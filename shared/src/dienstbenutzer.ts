/**
 * Benutzer und Gruppe, unter denen Ablago im Container läuft (#1354, #1466), und was das Start-Skript dafür geändert
 * hat. Das Start-Skript (deploy/image/start-hilfen.sh) wählt sie und legt Wahl und Änderungen im Merker des Containers
 * ab; der Server liest sie (server/src/einrichtung/dienstbenutzer.ts). Hier die Form und die Sätze dazu – gleich für
 * die Startseite (Server) und den Systemzustand der Werkbank (Oberfläche).
 */

/** Woher eine Kennung kommt: wie der Datenordner, Vorgabe 1000, oder aus PUID/PGID. */
export type Kennungsherkunft = 'daten' | 'vorgabe' | 'gesetzt';
/** Warum die Vorgabe gilt: Datenordner gehört root, einem Systembenutzer des Containers, oder keiner ist eingebunden. */
export type Vorgabegrund = 'root' | 'system' | 'ohne';
/**
 * Was beim Start geändert wurde: Besitzer (gehörte root bzw. – mit PUID/PGID – einem anderen Benutzer), o-rwx an einem
 * Ordner, der jetzt Ablago gehört, go-rwx an Dateien mit Schlüsseln in geheim.
 */
export type Aenderungsart = 'besitzer-root' | 'besitzer' | 'rechte' | 'geheim';

export interface KennungAenderung {
  /** ISO-Zeit. */
  zeit: string;
  art: Aenderungsart;
  /** Ordner im Container, z. B. /data/files. */
  ordner: string;
  anzahl: number;
  /** Neuer Besitzer, uid:gid. */
  nach: string;
}

export interface Dienstbenutzer {
  benutzer: number | null;
  gruppe: number | null;
  /** null: nicht vom Start-Skript des Images gewählt (Entwicklung, `docker run --user`). */
  herkunft: { benutzer: Kennungsherkunft; gruppe: Kennungsherkunft } | null;
  grund: Vorgabegrund | null;
  aenderungen: KennungAenderung[];
}

/** Ordner, in den Ablago nicht schreiben kann (Startseite bei `daten-rechte`). */
export interface Rechtefehler {
  /** files, geheim, sicherung oder export. */
  ordner: string;
  /** Besitzer uid:gid, wie das Start-Skript ihn gesehen hat. */
  besitzer: string;
  /** Rechte oktal, z. B. 755. */
  rechte: string;
  schreibgeschuetzt: boolean;
}

type Frei = (schluessel: string, werte?: Readonly<Record<string, string | number>>) => string;

/** Kurzname eines Ordners für Startseite und Systemzustand (ohne Pfad): /data/files → files. */
const ordnerName = (pfad: string) => pfad.replace(/^\/data\/?/, '') || 'data';

function herkunftText(h: Kennungsherkunft, grund: Vorgabegrund | null, frei: Frei): string {
  if (h === 'vorgabe') return frei(`systemzustand.kennung.herkunft.vorgabe.${grund ?? 'ohne'}`);
  return frei(`systemzustand.kennung.herkunft.${h}`);
}

/** Ein Satz: welcher Benutzer und warum. null ohne Wahl des Start-Skripts. */
export function kennungSatz(k: Dienstbenutzer, frei: Frei): string | null {
  if (!k.herkunft || k.benutzer === null || k.gruppe === null) return null;
  const hb = herkunftText(k.herkunft.benutzer, k.grund, frei);
  const hg = herkunftText(k.herkunft.gruppe, k.grund, frei);
  return hb === hg
    ? frei('systemzustand.kennung.gleich', { benutzer: k.benutzer, gruppe: k.gruppe, herkunft: hb })
    : frei('systemzustand.kennung.getrennt', { benutzer: k.benutzer, gruppe: k.gruppe, herkunft: hb, herkunft2: hg });
}

/** Herkunft einer Kennung als kurzer Text (Systemzustand). */
export function herkunftKurz(k: Dienstbenutzer, wer: 'benutzer' | 'gruppe', frei: Frei): string | null {
  return k.herkunft ? herkunftText(k.herkunft[wer], k.grund, frei) : null;
}

/** Eine Änderung als Satz, ohne Pfad (die Startseite verrät vor der Anmeldung keine Pfade). */
export function aenderungText(a: KennungAenderung, frei: Frei): string {
  return frei(`systemzustand.kennung.aenderung.${a.art}`, { anzahl: a.anzahl, ordner: ordnerName(a.ordner), nach: a.nach });
}

/** Kennung, die als PUID/PGID taugt: nie root, nie die Dokumentwerkzeuge (61000). */
function taugtAlsKennung(uid: number, gid: number): boolean {
  return uid > 0 && gid > 0 && uid !== 61000 && gid !== 61000;
}

/** Vorschlag des Start-Skripts für PUID/PGID (uid:gid) prüfen: nur Zahlen, die als Kennung taugen. */
export function kennungVorschlag(text: string | null | undefined): { puid: number; pgid: number } | null {
  const m = /^(\d{1,10}):(\d{1,10})$/.exec(text?.trim() ?? '');
  if (!m) return null;
  const [puid, pgid] = [Number(m[1]), Number(m[2])];
  return taugtAlsKennung(puid, pgid) ? { puid, pgid } : null;
}
