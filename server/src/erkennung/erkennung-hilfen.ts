/** Erkennung (#1278 aus erkennung.ts): Typen, Grenzen und Hilfen ohne die Klasse. */
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import type { Treffer, Fund, Nummernfund, Briefkopf, Vorschlaege, EigeneAngaben, Angaben, Aussteller } from '../../../shared/src/erkennung';
import type { Betrag, MappenBezug, Wert } from '../../../shared/src/model';
import type { ERechnung } from '../../../shared/src/erechnung';
import { stehtImText } from '../../../shared/src/klassifizierung';

export const log = protokoll.modul('ablage');

/** Ein Vorschlag für die Zielmappe; die Gründe stehen ohne Titel da (die setzt erst das Lesen ein). */
export interface Zielvorschlag {
  mappeId: string;
  typId: string;
  punkte: number;
  gruende: string[];
  /** Direkt im Text gefunden (z. B. Vertragsnummer). */ direkt?: boolean;
}

/** Automatische Zuordnung (#337), festgehalten an der Erkennung der Post – für „Rückgängig“. */
export interface AutoZuordnung {
  ziel: string;
  zeit: string;
  grund: string;
  /** Dokumente, die zur Zielmappe gewandert sind, mit ihrem Register in der Post. */
  dokumente: Array<{ id: string; register: string }>;
  aufgabe: string | null;
  /** Rückgängig gemacht: dann nie wieder automatisch. */
  rueckgaengig?: { zeit: string; von: string | null };
}

/**
 * Ist die Erkennung „sicher“ (#337)? Absender eindeutig an einem starken Merkmal (Kundennummer, IBAN …) und genau
 * eine passende Zielmappe unter den Mappentypen, die automatisch zuordnen dürfen – bei mehreren gewinnt die eine,
 * die direkt im Text steht (z. B. über ihre Vertragsnummer), sonst die eine, die auf den Absender verweist (#1639).
 * Liefert Ziel und Begründung oder den Grund dagegen.
 */
export function sichereZuordnung(
  e: Pick<PostErkennung, 'absender' | 'eindeutig' | 'ziele' | 'ausgehend'>,
  autoTypen: Set<string>,
): { ziel: Zielvorschlag; grund: string } | { ziel: null; grund: string } {
  // Eigene Post (#1043): nie still zuordnen – „ausgehend“ ist nur ein Vorschlag (Ergänzung Sicherheit).
  if (e.ausgehend) return { ziel: null, grund: t('meldungen.erkennung.ausgehend-nicht-automatisch') };
  const abs = e.absender.find((x) => x.mappeId === e.eindeutig);
  if (!abs || !abs.stark) return { ziel: null, grund: t('meldungen.erkennung.absender-nicht-eindeutig-erkannt') };
  const kandidaten = e.ziele.filter((z) => autoTypen.has(z.typId));
  const direkt = kandidaten.filter((z) => z.direkt);
  // #1639: Seit alle Mappentypen „Was Ablago darf“ folgen, ist der Absender selbst fast immer Kandidat. Verweist genau
  // eine andere Mappe auf ihn (z. B. der Vertrag), ist sie das genauere Ziel; der Absender nur, wenn sonst keine passt.
  const genauer = kandidaten.filter((z) => z.mappeId !== e.eindeutig);
  const einzig = genauer.length === 1 ? genauer[0] : !genauer.length && kandidaten.length === 1 ? kandidaten[0] : null;
  const ziel = direkt.length === 1 ? direkt[0] : !direkt.length ? einzig : null;
  if (!ziel)
    return {
      ziel: null,
      grund: kandidaten.length
        ? t('meldungen.erkennung.passende-mappen-nicht-eindeutig', { kandidaten: kandidaten.length })
        : t('meldungen.erkennung.keine-passende-mappe-eines'),
    };
  return {
    ziel,
    grund: t('meldungen.erkennung.absender-eindeutig-erkannt-einzige', {
      gruende: abs.gruende.join(', '),
      gruende2: ziel.gruende.join(', '),
    }),
  };
}

/** Was an einer Post gespeichert ist. */
export interface PostErkennung {
  zeit: string;
  /** Dokumente der Post mit Volltext. */
  dokumente: number;
  /** Mögliche Absender (Organisation, Niederlassung, Person …), beste zuerst. */
  absender: Treffer[];
  /** Eindeutig erkannter Absender (genau einer mit starkem Merkmal). */
  eindeutig: string | null;
  /** gutschrift (#1043): „Gutschrift“, „Erstattung“ … auf dem Beleg – der Betrag gehört dann negativ in Felder, die das erlauben. */
  angaben: { datum: Fund | null; betrag: Fund<Betrag> | null; nummern: Nummernfund[]; gutschrift?: Fund };
  /** Absender aus dem Briefkopf, wenn keiner der vorhandenen passt. */
  briefkopf: Briefkopf | null;
  ziele: Zielvorschlag[];
  /** Automatisch zugeordnet (#337). */
  auto?: AutoZuordnung;
  /**
   * Ausgehend? (#1043): Eine eigene Organisation oder eine Person des Haushalts steht als Aussteller in der
   * Absenderzeile. Nur ein Hinweis – die Richtung der Post ändert die Erkennung nie selbst.
   */
  ausgehend?: { mappeId: string; fundstelle: string };
}

/** Was ein Benutzer davon sieht: nur lesbare Mappen, mit Titeln. */
export interface ErkennungAntwort {
  zeit: string;
  dokumente: number;
  absender: Array<Treffer & { titel: string }>;
  eindeutig: string | null;
  angaben: PostErkennung['angaben'];
  /** Unbekannter Absender: Vorschlag „neue Organisation anlegen“ mit vorbelegten Feldern. */
  neuerAbsender: { typId: string; werte: Record<string, string>; fundstelle: string } | null;
  ziele: Array<Zielvorschlag & { titel: string }>;
  bezuege: Record<string, MappenBezug>;
  /** Automatisch zugeordnet (#337) – nur, wenn der Benutzer Ziel und Absender lesen darf. */
  auto: { ziel: string; zeit: string; grund: string; rueckgaengig: boolean } | null;
  /** Ausgehend? (#1043): Aussteller ist eine eigene Organisation bzw. Person des Haushalts (Titel nur, wenn lesbar). */
  ausgehend: { titel: string; fundstelle: string } | null;
}

/** „Aus Dokument ausfüllen“ (#391): Vorschläge für die Felder eines Mappentyps. */
export interface TypVorschlaege {
  /** Je Feld Wert, Sicherheit und Fundstelle – geprüft gegen die Feldtypen; Verweise als Mappen-Id. */
  vorschlaege: Vorschlaege;
  /** Titel der vorgeschlagenen Mappen in Verweisfeldern. */
  bezuege: Record<string, MappenBezug>;
  /** Verweisfeld ohne passende Mappe: „neue Organisation mit diesen Angaben anlegen“. */
  neu: Record<string, { typId: string; werte: Record<string, string>; fundstelle: string }>;
  /** Wie viele Werte die Prüfung verworfen hat. */
  verworfen: number;
  /** Länge des gelesenen Texts (0 = nichts gelesen). */
  zeichen: number;
  /** Womit erkannt wurde (#511): eingebaut oder ein Paket. */
  engine: { art: 'eingebaut' } | { art: 'paket'; id: string; name: string };
  /** Hinweis, z. B. wenn das gewählte Paket nicht antwortete und die eingebaute Erkennung übernahm. */
  hinweis?: string;
  /** Das Paket hat nur einen Teil des Dokumenttexts gelesen (#564) – gekürzt vom Kern oder vom Paket. */
  gekuerzt?: true;
  /** Aus einer E-Rechnung gelesen (#1043): Format und Profil; die Werte daraus haben Vorrang. */
  erechnung?: { syntax: 'ubl' | 'cii'; gutschrift: boolean; profil?: string; nummer?: string };
  /**
   * Positionen aus der E-Rechnung (#1043) für eine Tabelle des Typs (#1030): Mappen des Teiltyps, die beim Speichern
   * angelegt werden – geprüft wie jede Eingabe; nur, wenn die Person sie anlegen darf.
   */
  positionen?: {
    feld: string;
    typId: string;
    feldKey: string;
    zeilen: Array<Record<string, Wert>>;
    weitere?: number;
    /** So viele (lesbare) Positionen hat die Mappe schon – dann bietet die Oberfläche das Anlegen nur ohne Haken an. */
    vorhanden?: number;
    /** Hat die Mappe schon Positionen und fehlt `positionen: true` in der Anfrage: so viele wurden nicht mitgeschickt (zeilen leer). */
    zurueckgehalten?: number;
  };
  /**
   * Gehört dazu (#1043): vorhandene Mappen anderer Typen, die im Dokument stehen und über ein leeres Verweisfeld zu
   * dieser Mappe gehören (z. B. der Lieferschein zur Rechnung). Verknüpft wird erst beim Speichern, wenn die Person es
   * so lässt; nur lesbare Mappen.
   */
  dazu?: Array<{ mappeId: string; typId: string; titel: string; feldKey: string; feld: string; gruende: string[] }>;
}
export const TEXT_MAX = 200_000;

/** Wer Felder per Paket erkennt (#511): der Paket-Läufer mit den Paketen, die dms:erkennen haben und geladen sind. */
export interface ErkennAnbieter {
  pakete(): Array<{ id: string; name: string; netz: boolean }>;
  erkenne(paket: string, eingang: Record<string, unknown>, ms: number): Promise<{ text: string; ms: number }>;
}
/** Wahl in der Werkbank: Standard für alle Mappentypen (null = eingebaut); abfluss: Hinweis bei Netzzugriff bestätigt. */
export interface EngineWahl {
  paket: string | null;
  abfluss?: boolean;
}
/** Zeitlimit für die Antwort eines Pakets (ms); danach übernimmt die eingebaute Erkennung. */
export const ERKENNEN_MS = 60_000;
/** Höchstens so viel Text (Zeichen) geht an ein Paket. */
export const PAKET_TEXT_MAX = 50_000;

/** Eigene Mappen (#995, #1043): eigene Organisationen und Personen des Haushalts – nie Absender bzw. „von“. */
export interface EigeneLage {
  ids: Set<string>;
  /** Je eigene Mappe (und je Benutzer) Namen, USt-Id und IBAN – woran sie als Aussteller zu erkennen ist. */
  angaben: EigeneAngaben[];
}
/** Aussteller eines Belegs: die Absenderzeile, bei einer E-Rechnung der Verkäufer. */
export function ausstellerAus(a: Angaben, er?: ERechnung | null): Aussteller | null {
  if (er?.verkaeufer.name || er?.verkaeufer.ustid)
    return {
      name: er.verkaeufer.name,
      ustid: er.verkaeufer.ustid,
      iban: er.iban,
      fundstelle: `${t('meldungen.erkennung.erechnung-verkaeufer')}: ${er.verkaeufer.name ?? er.verkaeufer.ustid}`,
    };
  return a.briefkopf?.zeile && a.briefkopf.name ? { name: a.briefkopf.name, fundstelle: a.briefkopf.fundstelle } : null;
}
/** Höchstens so viele Mappen je Typ beim Suchen eigener Mappen. */
export const MAX_EIGENE = 2000;

export const MAX_ABSENDER = 5;
export const MAX_ZIELE = 8;
export const MAX_MAPPEN = 20_000;

/**
 * Fundstellen aus einem Paket (#939) müssen wörtlich im Dokument stehen (bis auf Leerraum und Groß-/Kleinschreibung) –
 * sonst fällt die Fundstelle weg, der Wert bleibt (ohne Rahmen). Alte Pakete ohne Fundstelle laufen unverändert weiter.
 */
export function ohneFremdeFundstellen(
  vorschlaege: Record<string, unknown>,
  text: string,
  typ: string,
  paket: string,
): Record<string, unknown> {
  let weg = 0;
  const erg = Object.fromEntries(
    Object.entries(vorschlaege).map(([k, roh]) => {
      if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return [k, roh];
      const o = roh as Record<string, unknown>;
      if (typeof o.fundstelle !== 'string' || !o.fundstelle.trim() || stehtImText(text, o.fundstelle)) return [k, roh];
      weg++;
      return [k, { ...o, fundstelle: '' }];
    }),
  );
  if (weg) log.info('Fundstellen aus Paket verworfen (stehen nicht im Dokument)', { typ, paket, anzahl: weg });
  return erg;
}
