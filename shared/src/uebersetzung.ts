/**
 * Inhalte übersetzen auf Knopfdruck (#732): Ein Paket mit dem Recht `dms:uebersetzen` übersetzt **einen** Text – den
 * Wert eines Textfelds, eine Notiz oder den Volltext eines Dokuments – in die Sprache der Person, die den Knopf
 * „Übersetzung anzeigen“ drückt. Nie automatisch im Hintergrund.
 *
 * - Der **Kern liest den Text selbst**, mit den Rechten der Person: Übersetzt wird nur, was sie lesen darf. Das Paket
 *   bekommt nur diesen einen Text (in Abschnitten), keine Rechte an Mappen oder Dokumenten.
 * - Gespeichert und bearbeitet wird **immer nur das Original**. Die Übersetzung liegt nur im Zwischenspeicher
 *   (Prüfwert des Abschnitts, Zielsprache, Paket und Version) und verfällt, sobald sich das Original ändert.
 * - Darf das Paket ins Netz, verlässt der Text das Gerät: Das geht nur, wenn der Administrator es in der Werkbank
 *   ausdrücklich bestätigt, und am Ergebnis steht, wohin (Regel aus #701).
 *
 * Diese Datei teilen Server und Oberfläche: Grenzen, Abschnitte, Einstellung und Sprachkennungen.
 */
import { t } from './texte';

/** Ab dieser Version kennt das DMS `dms:uebersetzen` (vorläufig, die Versionsnummer setzt das Release). */
export const DMS_UEBERSETZEN_AB = '0.204.0';
/** So lang ist ein Abschnitt höchstens (Zeichen) – ein Aufruf des Pakets je Abschnitt. */
export const ABSCHNITT_MAX = 4000;
/** Mehr Text (Zeichen) übersetzt der Kern nicht; längere Volltexte nur bis hierhin, mit Hinweis. */
export const UEBERSETZEN_TEXT_MAX = 400_000;
/** Zeitlimit je Abschnitt (ms). */
export const UEBERSETZEN_MS = 60_000;
/** So lange hält der Zwischenspeicher eine Übersetzung, wenn niemand sie wieder abruft (Tage). */
export const UEBERSETZUNG_TAGE = 30;
/** Feldarten mit Text, die sich übersetzen lassen. */
export const UEBERSETZBARE_FELDER = ['text', 'langtext', 'formatiert'] as const;

/** Was übersetzt werden soll – nur Kennungen; den Text liest der Kern selbst. */
export type Uebersetzungsquelle =
  { art: 'feld'; mappe: string; feld: string } | { art: 'notiz'; notiz: string } | { art: 'volltext'; dokument: string };

/** Einstellung „uebersetzen“ (Werkbank → Sprachen): an für alle, welches Paket, Abfluss bestätigt. */
export interface UebersetzenEinstellung {
  /** Für alle angeboten (Vorgabe an, sobald ein Paket installiert ist). */
  an: boolean;
  /** Gewähltes Paket; null = das erste mit dem Recht (nach Id), das ohne Netz auskommt. */
  paket: string | null;
  /** Der Administrator hat bestätigt, dass Texte an den Dienst des gewählten Pakets gehen (nur bei Paketen mit Netz). */
  abfluss?: boolean;
}

export function liesUebersetzenEinstellung(v: unknown): UebersetzenEinstellung {
  const x = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const paket = typeof x.paket === 'string' && x.paket ? x.paket : null;
  return { an: x.an !== false, paket, ...(paket && x.abfluss === true ? { abfluss: true } : {}) };
}

/** Angebot für die Oberfläche (Kontostand): Gibt es den Knopf, womit wird übersetzt, verlässt der Text das Gerät? */
export interface UebersetzenAngebot {
  paket: { id: string; name: string };
  /** Zielsprache: die der Person. */
  nach: string;
  /** Wohin der Text geht, wenn er das Gerät verlässt (Adressen bzw. Dienst-Adresse des Pakets); null = bleibt im Haus. */
  netz: string[] | null;
  /** Die Person hat es für sich abgeschaltet (Mein Konto) – dann kein Knopf, aber der Schalter. */
  aus: boolean;
}

/** Antwort je Abschnitt. Die Oberfläche setzt die Abschnitte mit `trenner` wieder zusammen. */
export interface Uebersetzt {
  teil: number;
  teile: number;
  /** Übersetzter Abschnitt (bei `gleich` das Original). */
  text: string;
  /** Leerraum, der im Original auf den Abschnitt folgt (Absatz, Seitenvorschub). */
  trenner: string;
  /** Ausgangssprache (BCP 47, z. B. „en“), soweit bekannt. */
  von: string | null;
  nach: string;
  /** Der Text ist schon in der Zielsprache – nichts übersetzt. */
  gleich?: true;
  /** Nur die ersten {@link UEBERSETZEN_TEXT_MAX} Zeichen übersetzt. */
  gekuerzt?: true;
  /** Aus dem Zwischenspeicher. */
  gespeichert?: true;
  paket: { id: string; name: string; version: string };
  netz: string[] | null;
  /** Prüfwert des ganzen Originals (SHA-256): Ändert er sich zwischen zwei Abschnitten, fängt die Oberfläche neu an. */
  pruefwert: string;
}

/** Ein Abschnitt des Originals und der Leerraum danach; `text + trenner` aller Abschnitte ergibt das Original. */
export interface Abschnitt {
  text: string;
  trenner: string;
}

/**
 * Text in Abschnitte von höchstens `max` Zeichen teilen – bevorzugt an Seitenvorschub, Absatz, Zeilenende, Satzende,
 * zuletzt an einem Leerzeichen oder hart. Leerraum am Ende eines Abschnitts wandert in den Trenner, damit die
 * Übersetzung Absätze und Seiten behält.
 */
export function abschnitte(text: string, max = ABSCHNITT_MAX): Abschnitt[] {
  const aus: Abschnitt[] = [];
  let rest = text;
  while (rest.length) {
    let ende = rest.length;
    if (rest.length > max) {
      const fenster = rest.slice(0, max);
      const stelle = (re: RegExp) => {
        let p = -1;
        for (const m of fenster.matchAll(re)) p = (m.index ?? 0) + m[0].length;
        return p > max / 4 ? p : -1;
      };
      ende = [/\f/g, /\n\s*\n/g, /\n/g, /[.!?…:;]["“”»)]?\s/g, /\s/g].map(stelle).find((p) => p > 0) ?? max;
    }
    const stueck = rest.slice(0, ende);
    const inhalt = stueck.replace(/\s+$/u, '');
    aus.push({ text: inhalt, trenner: stueck.slice(inhalt.length) });
    rest = rest.slice(ende);
  }
  // Leerraum am Anfang gehört zu keinem Abschnitt: als leerer Abschnitt mit Trenner, damit nichts verloren geht.
  if (aus.length && /^\s/u.test(aus[0].text)) {
    const vorne = /^\s+/u.exec(aus[0].text)![0];
    aus[0] = { text: aus[0].text.slice(vorne.length), trenner: aus[0].trenner };
    aus.unshift({ text: '', trenner: vorne });
  }
  return aus;
}

/** Tesseract-Kennung der Texterkennung (#400, „fra“) → Sprachkennung wie in der Oberfläche („fr“). */
const TESSERACT: Record<string, string> = {
  deu: 'de',
  eng: 'en',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  nld: 'nl',
  tur: 'tr',
  pol: 'pl',
  por: 'pt',
  rus: 'ru',
  ukr: 'uk',
  ara: 'ar',
};
export const spracheAusTesseract = (s: string | null | undefined): string | null => (s ? (TESSERACT[s] ?? null) : null);

/** Sprachkennung wie „de“, „en“ oder „pt-BR“ (BCP 47, kurz). */
export const SPRACHKENNUNG_KURZ = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** Kennzeichnung über jeder Übersetzung: „Maschinell übersetzt aus Englisch – nicht verbindlich“. */
export function kennzeichnung(von: string | null, name: (s: string) => string): string {
  return von ? t('gemeinsam.uebersetzung.kennzeichnung-aus', { sprache: name(von) }) : t('gemeinsam.uebersetzung.kennzeichnung');
}
