/**
 * Angezeigtes holt sich den neuen Stand selbst (#919) – „Nachhinken ja, falsch nie“.
 *
 * Ein Baustein für alles, was die Oberfläche von selbst nachfragt: Startseite und Zähler der Seitenleiste (#919), der
 * Hinweis „Gerade auch im Verwaltungsmodus“ in der Werkbank (#921). Er fragt etwas Billiges ab (einen Stand, eine
 * kurze Liste) und meldet nur, wenn es sich geändert hat; die Seite lädt dann, was sie zeigt.
 *
 * - Alle 10–15 s (zufällig gestreut, damit nicht alle Browser im selben Augenblick fragen), nur im sichtbaren Tab
 *   (`document.visibilityState`); beim Zurückkehren in den Tab sofort einmal.
 * - Gleicher Wert → nichts. Fehler (nicht erreichbar, abgemeldet) → nichts melden, weiter im Takt.
 * - Nachlauf: Zahlen anderer dürfen ein paar Sekunden nachhinken (Zwischenspeicher #742, #918). Nach einer gemeldeten
 *   Änderung – und nach dem ersten Wert, weil die Seite ihre Daten unabhängig davon geladen hat – meldet der Baustein
 *   beim nächsten Takt noch einmal, auch wenn der Wert gleich blieb. Danach ruht er bis zur nächsten Änderung.
 *
 * Der Ablauf hängt nicht an React und nicht am Browser (`Umgebung`), damit er sich prüfen lässt und später auf einen
 * Ereigniskanal (Ideensammlung „Live-Aktualisierung“) oder auf Benachrichtigungen im Hintergrund-Tab (#922) umziehen
 * kann: Dann liefert die Quelle den Wert, statt dass der Baustein fragt – `schritt` bleibt.
 */

/** Takt in Millisekunden: zwischen 10 und 15 Sekunden. */
export const TAKT_MS: readonly [number, number] = [10_000, 15_000];

export interface Nachladezustand {
  /** Zuletzt gesehener Schlüssel; null = noch keiner. */
  schluessel: string | null;
  /** Beim nächsten Takt noch einmal melden, auch bei gleichem Schlüssel. */
  nachlauf: boolean;
}
export const ANFANG: Nachladezustand = { schluessel: null, nachlauf: false };

export interface Schrittart {
  /** Nachlauf nach einer Änderung und nach dem ersten Wert (für Zahlen aus einem Zwischenspeicher). Vorgabe an. */
  nachlauf?: boolean;
  /** Den ersten Wert melden (die Seite zeigt ihn selbst an) statt ihn nur zu merken. Vorgabe aus. */
  erstesMelden?: boolean;
}

/** Ein Takt als reine Funktion: neuer Zustand und ob die Seite neu laden (bzw. den Wert übernehmen) soll. */
export function schritt(z: Nachladezustand, schluessel: string, o: Schrittart = {}): { zustand: Nachladezustand; melden: boolean } {
  const nachlauf = o.nachlauf !== false;
  if (z.schluessel === null) return { zustand: { schluessel, nachlauf }, melden: !!o.erstesMelden };
  if (schluessel !== z.schluessel) return { zustand: { schluessel, nachlauf }, melden: true };
  if (z.nachlauf) return { zustand: { schluessel, nachlauf: false }, melden: true };
  return { zustand: z, melden: false };
}

/** Was der Baustein vom Browser braucht – in Tests ersetzt. */
export interface Umgebung {
  sichtbar(): boolean;
  /** Bei jedem Wechsel der Sichtbarkeit; liefert das Abmelden. */
  beiSichtbarkeit(f: () => void): () => void;
  /** Einmal nach `ms`; liefert das Abbrechen. */
  spaeter(ms: number, f: () => void): () => void;
  /** Zahl in [0, 1) für die Streuung des Takts. */
  zufall(): number;
}

/** Nur das Nötige vom Dokument – die Datei bleibt so auch ohne DOM-Typen übersetzbar (Tests im Server). */
interface Dokument {
  visibilityState: string;
  addEventListener(art: string, f: () => void): void;
  removeEventListener(art: string, f: () => void): void;
}
const dokument = () => (globalThis as { document?: Dokument }).document;

export const browserUmgebung = (): Umgebung => ({
  sichtbar: () => (dokument()?.visibilityState ?? 'visible') === 'visible',
  beiSichtbarkeit: (f) => {
    dokument()?.addEventListener('visibilitychange', f);
    return () => dokument()?.removeEventListener('visibilitychange', f);
  },
  spaeter: (ms, f) => {
    const id = setTimeout(f, ms);
    return () => clearTimeout(id);
  },
  zufall: Math.random,
});

export interface Nachladen<T> extends Schrittart {
  /** Der billige Wert (Stand, kurze Liste). */
  hole(): Promise<T>;
  /** Geändert (bzw. Nachlauf, bzw. erster Wert mit `erstesMelden`). */
  melde(wert: T): void;
  /** Vergleichsschlüssel; Vorgabe: der Wert als JSON. */
  schluessel?(wert: T): string;
  umgebung?: Umgebung;
  takt?: readonly [number, number];
}

/** Startet das Nachfragen; liefert das Beenden. Der erste Abruf läuft sofort (im sichtbaren Tab). */
export function starteNachladen<T>(o: Nachladen<T>): () => void {
  const u = o.umgebung ?? browserUmgebung();
  const [von, bis] = o.takt ?? TAKT_MS;
  const schluessel = o.schluessel ?? ((w: T) => JSON.stringify(w));
  let zustand = ANFANG;
  let aus = false;
  let laeuft = false;
  let abbrechen: (() => void) | null = null;
  const plane = () => {
    abbrechen?.();
    abbrechen =
      aus || !u.sichtbar()
        ? null
        : u.spaeter(von + Math.floor(u.zufall() * (bis - von + 1)), () => {
            abbrechen = null;
            void runde();
          });
  };
  async function runde() {
    // Im Hintergrund-Tab nicht fragen; der Wechsel zurück stößt die nächste Runde an.
    if (aus || laeuft || !u.sichtbar()) return;
    laeuft = true;
    try {
      const wert = await o.hole();
      if (aus) return;
      const s = schritt(zustand, schluessel(wert), o);
      zustand = s.zustand;
      if (s.melden) o.melde(wert);
    } catch {
      /* nicht erreichbar oder abgemeldet: nichts melden, weiter im Takt */
    } finally {
      laeuft = false;
      plane();
    }
  }
  const weg = u.beiSichtbarkeit(() => {
    if (aus) return;
    if (u.sichtbar()) {
      abbrechen?.();
      abbrechen = null;
      void runde();
    } else {
      abbrechen?.();
      abbrechen = null;
    }
  });
  void runde();
  return () => {
    aus = true;
    abbrechen?.();
    abbrechen = null;
    weg();
  };
}
