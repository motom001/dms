/** Paketverwaltung (#1278 aus pakete.ts): Pakete dazuholen, alle aktualisieren, mehrere Pakete in einem Ablauf. */
import type { KatalogPaket, Katalog, NeueVersion, Ergaenzung, HerkunftPruefung } from './katalog';
import { vergleicheVersion, dmsPasst, passt, nachAbhaengigkeiten } from './versionen';
import { PAKETE_JE_NUTZUNG } from '../einrichtungsplan';

/* ---------- Pakete dazuholen (#1048) ---------- */

/** Art eines Pakets im Katalog (#1048, wie die Katalog-Übersicht, dms-registry #165). */
export type PaketArt = 'paket' | 'sprache' | 'ergaenzung';
/**
 * Sprachpaket, Ergänzung eines anderen Pakets oder ein Paket – nach der neuesten zur Ablago-Version passenden Version.
 * Sprachen und Ergänzungen stehen nicht in der ersten Liste, sondern beim Filter „Sprachen“, beim Hauptpaket und in der Suche.
 */
export function paketArt(p: KatalogPaket, dms = ''): PaketArt {
  const v = [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((x) => dmsPasst(dms, x.dms)) ?? p.versionen[0];
  return v?.sprache ? 'sprache' : v?.ergaenzt ? 'ergaenzung' : 'paket';
}

/** Höchstens so viele Pakete unter „Für dich empfohlen“ (#1048; Katalog: 6–8). */
export const EMPFOHLEN_MAX = 8;
/** Ohne Liste im Katalog (#1048): wie der Einrichtungsassistent (#1045) – dazu Texterkennung und Benachrichtigungen (#460). */
const EMPFOHLEN_OHNE_KATALOG = ['texterkennung', 'benachrichtigungen'];

/**
 * „Für dich empfohlen“ (#1048): die Empfehlungsliste des Katalogs (sonst die des Einrichtungsassistenten), passend zum
 * Merkmal „beruflich genutzt“ (#1032) – ohne Pakete, die nur beruflich zählen (z. B. Compliance), solange es nicht
 * gesetzt ist; mit ihnen, wenn es gesetzt ist. Ohne schon Installiertes, ohne Sprachen und Ergänzungen.
 */
export function empfehlungen(k: Katalog, o: { beruflich: boolean; dms: string; installiert: Array<{ id: string }> }): KatalogPaket[] {
  const nurBeruflich = PAKETE_JE_NUTZUNG.beruflich.filter((id) => !PAKETE_JE_NUTZUNG.privat.includes(id));
  const grund = k.empfohlen?.length ? k.empfohlen : [...PAKETE_JE_NUTZUNG.privat, ...EMPFOHLEN_OHNE_KATALOG];
  const ids = o.beruflich ? [...grund, ...nurBeruflich] : grund.filter((id) => !nurBeruflich.includes(id));
  const da = (p: KatalogPaket) => o.installiert.some((x) => x.id === p.id || p.ersetzt?.includes(x.id));
  return [...new Set(ids)]
    .flatMap((id) => k.pakete.filter((p) => p.id === id))
    .filter((p) => !da(p) && paketArt(p, o.dms) === 'paket')
    .slice(0, EMPFOHLEN_MAX);
}

/* ---------- Alle aktualisieren (#1168) ---------- */

/** Was „Alle aktualisieren“ von einer Vorschau braucht (Vorschau des Servers, hier nur die genutzten Teile). */
export interface RundenVorschau {
  paket: { id: string; version: string; abhaengigkeiten: Record<string, string> };
  abhaengigkeiten: Array<{ id: string; bereich: string; problem?: string }>;
  probleme: string[];
  namenskonflikte?: string[];
  laeufer?: { bestaetigen: boolean } | null;
  umbau?: unknown[];
  herausgeberBestaetigen?: string | null;
  pruefung?: { bestaetigen?: boolean } | null;
}
/** Ein Paket der Runde: Update, Vorschau (oder warum sie fehlt), was die Runde löst, was bleibt, ob es eine Entscheidung braucht. */
export interface RundenEintrag<V extends RundenVorschau> {
  u: NeueVersion;
  v: V | null;
  fehler: string | null;
  /** Id nach dem Update (#1084: Umzug unter eine neue Id); an ihr hängen die Abhängigkeiten. */
  id: string;
  abhaengigkeiten: Record<string, string>;
  /** Probleme, die die Runde selbst löst: eine Abhängigkeit, die vorher auf eine passende Version kommt. */
  geloest: string[];
  /** Was das Update auch nach der Runde verhindert (Namenskonflikte zählen nicht – die löst das Umbenennen). */
  probleme: string[];
  /** Aus einem Katalog außer dem offiziellen: Herkunft bestätigen wie beim einzelnen Update. */
  fremd: boolean;
  /** Muss aufgeklappt und bestätigt werden: neue Rechte, Umbau, Herausgeber neu, Herkunft, Namenskonflikt. */
  entscheiden: boolean;
}

/**
 * Plan für „Alle aktualisieren“ (#1168): je Paket die Vorschau ausgewertet und in der Reihenfolge der Abhängigkeiten –
 * erst das, wovon andere abhängen; Ergänzungen hängen von ihrem Hauptpaket ab und kommen danach. Eine Abhängigkeit, die
 * in derselben Runde vorher auf eine passende Version kommt, verhindert nichts. offiziell: Ist das die Adresse des
 * offiziellen Katalogs?
 */
export function aktualisierungsRunde<V extends RundenVorschau>(
  liste: ReadonlyArray<{ u: NeueVersion; v: V | null; fehler: string | null }>,
  offiziell: (quelle: string) => boolean,
): RundenEintrag<V>[] {
  const runde = liste.flatMap((x) => (x.v ? [{ id: x.v.paket.id, version: x.v.paket.version }] : []));
  const eintraege = liste.map(({ u, v, fehler }): RundenEintrag<V> => {
    if (!v) return { u, v, fehler, id: u.id, abhaengigkeiten: {}, geloest: [], probleme: [], fremd: false, entscheiden: false };
    const geloest = v.abhaengigkeiten
      .filter((a) => a.problem && runde.some((r) => r.id === a.id && passt(r.version, a.bereich)))
      .map((a) => a.problem!);
    const probleme = v.probleme.filter((p) => !geloest.includes(p) && !v.namenskonflikte?.includes(p));
    const fremd = !offiziell(u.quelle) && v.pruefung?.bestaetigen !== false;
    const entscheiden =
      !!v.laeufer?.bestaetigen ||
      !!v.umbau?.length ||
      !!v.herausgeberBestaetigen ||
      !!v.pruefung?.bestaetigen ||
      fremd ||
      !!v.namenskonflikte?.length;
    return { u, v, fehler, id: v.paket.id, abhaengigkeiten: v.paket.abhaengigkeiten, geloest, probleme, fremd, entscheiden };
  });
  // Ein Kreis darf es nicht geben – dann bleibt die Reihenfolge, wie sie kam.
  return nachAbhaengigkeiten(eintraege) ?? eintraege;
}

/* ---------- Mehrere Pakete in einem Ablauf (#405) ---------- */

/**
 * Was zusammen installiert werden soll: Pakete aus einem Katalog (Abhängigkeiten kommen mit) oder die hochgeladenen
 * Pakete einer Sammeldatei (Upload-Kennungen). Derselbe Ablauf für Werkbank → Pakete, den Einrichtungsassistenten
 * (#460) und die Sammeldatei (#461).
 */
export interface AblaufEingabe {
  /** Katalogadresse; ohne: der offizielle Katalog. */
  quelle?: string;
  /** Paket-Ids aus dem Katalog – selbst gewählt, samt angehakter Ergänzungen; „id@1.2.0“ für eine bestimmte Version. */
  pakete?: string[];
  /** Upload-Kennungen der Pakete einer Sammeldatei. */
  uploads?: string[];
}
/** Die Antworten aus dem Ablauf – jede Frage einmal, mit Ausnahmen je Paket. */
export interface AblaufInstallation extends AblaufEingabe {
  /** Je Paket-Id: Namen für Mappentypen bzw. Ansichten (nur bei Namenskonflikten nötig). */
  namen?: Record<string, Record<string, string>>;
  sichtNamen?: Record<string, Record<string, string>>;
  /** Paket-Ids, deren Beispiel-Mappen angelegt werden. */
  beispiele?: string[];
  /** Je Paket-Id: Schlüssel der mitgelieferten Automatisierungen, die gleich eingeschaltet werden (#712). */
  automatisierungen?: Record<string, string[]>;
  /** Herkunft bestätigt (nicht offizielle Quelle bzw. ohne gültige Signatur) – ein Haken für alle. */
  bestaetigt?: boolean;
  /** Stand der Rechte, die der Administrator gesehen und erlaubt hat (AblaufPlan.rechte.stand) – ein Haken für alle. */
  rechteStand?: string;
  /** Je Paket-Id: Pflicht-Einstellungen. */
  einstellungen?: Record<string, Record<string, unknown>>;
  /** Paket-Ids, deren Pflicht-Einstellungen bewusst später kommen („Einstellungen nötig“ und Hinweis in der Übersicht). */
  spaeter?: string[];
  /** Dienst-Adressen in den Einstellungen bestätigt. */
  adresseBestaetigt?: boolean;
  /** Erstmals gesetzte Herausgeber von Bestandspaketen bestätigt (#1084) – ein Haken für alle. */
  herausgeberBestaetigt?: boolean;
  /**
   * Aus dem Einrichtungsassistenten (#1566): Ablago hat die Pakete gewählt oder die Person selbst. Nur während der
   * Einrichtung steht dann die Liste im Nachweis-Journal.
   */
  einrichtung?: 'ablago' | 'selbst';
}
export interface AblaufPaket<V> {
  /** Paket-Id (Katalog) bzw. Upload-Kennung (Sammeldatei). */
  schluessel: string;
  id: string;
  name: string;
  version: string;
  /** Selbst gewählt; sonst kommt es als Abhängigkeit mit (fuer: Ids der Pakete, die es brauchen). */
  gewaehlt: boolean;
  fuer: string[];
  ergaenzt: Ergaenzung | null;
  vorschau: V;
  /** Pflicht-Einstellungen (Abschnitte), die nach den Vorgaben noch leer sind – gefragt im selben Ablauf. */
  einstellungen: import('../paketeinstellungen').EinstellungFeld[];
}
export interface AblaufPlan<V> {
  /** Reihenfolge der Installation: Abhängigkeiten zuerst. */
  pakete: AblaufPaket<V>[];
  /** Was die Installation verhindert (fehlende Abhängigkeiten, Kreise, schon installiert …). */
  probleme: string[];
  herkunft: HerkunftPruefung | null;
  herkunftBestaetigen: boolean;
  /** stand: Prüfwert aller Rechte, die bestätigt werden müssen – ändert sich eines, gilt die Bestätigung nicht mehr. */
  rechte: { bestaetigen: boolean; stand: string };
  /**
   * Pakete, die sich nicht laden ließen (Download, Prüfsumme, Archiv), und Pakete, die eines davon brauchen (#646):
   * Sie werden übersprungen, die übrigen lassen sich trotzdem installieren.
   */
  ausgelassen?: AblaufAusgelassen[];
  /** Auswahl für Einstellungen mit Verweisen (Mappentypen, Benutzer, Rollen, Ansichten). */
  auswahl: {
    typen: Array<{ id: string; name: string; felder: Array<{ key: string; label: string }> }>;
    benutzer: Array<{ id: string; name: string }>;
    rollen: Array<{ id: string; name: string }>;
    sichten: Array<{ id: string; name: string }>;
  };
}
/** Ein Paket, das übersprungen wurde (#646), mit Grund – z. B. „lässt sich nicht herunterladen …“ oder „braucht …“. */
export interface AblaufAusgelassen {
  id: string;
  name: string;
  version: string;
  grund: string;
}
export interface AblaufErgebnis {
  installiert: Array<{ id: string; name: string; version: string; einstellungen: 'keine' | 'fertig' | 'spaeter' | 'fehler' }>;
  /** Pakete, die beim Installieren scheiterten (#646) – jedes ist vollständig zurückgenommen; die übrigen laufen weiter. */
  fehlgeschlagen: Array<{ id: string; name: string; meldung: string; gruende: string[] }>;
  /** Das erste davon (wie bis 0.158). */
  fehler: { id: string; name: string; meldung: string; gruende: string[] } | null;
  /** Nicht installiert, mit Grund: ließ sich nicht laden oder braucht ein Paket, das scheiterte (#646). */
  nichtInstalliert: AblaufAusgelassen[];
}

/**
 * Welche Pakete fallen weg, wenn diese scheitern (#646)? Alle, die – auch über Umwege – eines davon brauchen.
 * Liefert je wegfallendem Paket die Id des gescheiterten, an dem es hängt.
 */
export function haengenAn(
  pakete: Array<{ id: string; abhaengigkeiten: Record<string, string> }>,
  gescheitert: string[],
): Map<string, string> {
  const weg = new Map<string, string>();
  let neu = true;
  while (neu) {
    neu = false;
    for (const p of pakete) {
      if (weg.has(p.id) || gescheitert.includes(p.id)) continue;
      const an = Object.keys(p.abhaengigkeiten).find((a) => gescheitert.includes(a) || weg.has(a));
      if (an) {
        weg.set(p.id, gescheitert.includes(an) ? an : weg.get(an)!);
        neu = true;
      }
    }
  }
  return weg;
}
