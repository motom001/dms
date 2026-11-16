/** Zustand des Repos im Arbeitsspeicher (#1278): alle Tabellen als Maps und Listen, dazu die laufenden Nummern. */
import type { AblaufVerlauf, Ablaufvorlage, MappenAblauf } from '../../../../shared/src/ablaufvorlagen';
import type { GespeicherteFassung } from '../../../../shared/src/fassungen';
import type { LoeschEintrag } from '../../../../shared/src/loeschprotokoll';
import type {
  Aufgabe,
  Dokument,
  DokumentVersion,
  FallOhneLeserecht,
  Historieneintrag,
  Mappe,
  Mappentyp,
  Notiz,
} from '../../../../shared/src/model';
import type { Notfallkontakt } from '../../../../shared/src/notfallkontakte';
import type { Nummernkreis } from '../../../../shared/src/nummernkreis';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import type { VerlaufEintrag } from '../../../../shared/src/paketreiter';
import type { Seitensprache } from '../../../../shared/src/seitensprachen';
import type { Sicht } from '../../../../shared/src/sichten';
import type { AuskunftLinkIntern, Synonymgruppe, Verweis } from '..';

/** Ältere Versionen (#194) je Dokument, aufsteigend. */
export type V = DokumentVersion & { volltext: string | null };

/** Mappentypen, Mappen, Dokumente, Ansichten, Papierkorb und Historie. */
export function ablageZustand() {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const kreise = new Map<string, Nummernkreis>();
  /** Fassungen (#1006): je „art|eintrag“ in Reihenfolge der Nummer. */
  const fassungen = new Map<string, GespeicherteFassung[]>();
  const links = new Map<string, AuskunftLinkIntern>();
  const verweise = new Map<string, Verweis[]>();
  const dokumente = new Map<string, Dokument>();
  /** Seitensprachen je Dokument (#579). */
  const seitenSpr = new Map<string, Seitensprache[]>();
  const versionen = new Map<string, V[]>();
  const sichten = new Map<string, Sicht>();
  /** Änderungshistorie (#57). */
  const historie: Historieneintrag[] = [];
  /** Volltext je Dokument (#45). */
  const texte = new Map<string, string | null>();
  const vektoren = new Map<string, { dokumentId: string; paket: string; modell: string; vektor: Float32Array }>();
  /** Löschprotokoll (#470): nur anfügen. */
  const loeschprotokoll: LoeschEintrag[] = [];
  /** Einzelne Dokumente im Papierkorb (#344). */
  const dokKorb = new Map<
    string,
    { dokument: Dokument; text: string | null; versionen: V[]; geloescht: string; geloeschtVon: string | null }
  >();
  /** Papierkorb (#43): Mappe mit ihren Verweisen und Dokumenten, wie beim Löschen. */
  const korb = new Map<
    string,
    {
      mappe: Mappe;
      verweise: Verweis[];
      dokumente: Dokument[];
      versionen?: Array<[string, V[]]>;
      notizen?: Notiz[];
      aufgaben?: Aufgabe[];
      erinnerungen?: MappenAblauf[];
      geloescht: string;
      geloeschtVon: string | null;
      vorgang?: string | null;
      entkoppelt?: Array<{ quelleId: string; feldKey: string }>;
    }
  >();

  return {
    typen,
    mappen,
    kreise,
    fassungen,
    links,
    verweise,
    dokumente,
    seitenSpr,
    versionen,
    sichten,
    historie,
    texte,
    vektoren,
    loeschprotokoll,
    dokKorb,
    korb,
    historieNr: 0,
  };
}

/** Aufgaben, Favoriten, Notizen, Hinweise, Abläufe, Erkennung, Synonyme und Notfallkontakte. */
export function arbeitZustand() {
  /** Aufgaben (#54). */
  const aufgaben = new Map<string, Aufgabe>();
  /** Favoriten (#62): Benutzer → Mappen. */
  const favoriten = new Map<string, Set<string>>();
  // Favorit = Abo (#422): seit wann Favorit, ausgeschaltete Benachrichtigung, zuletzt gesehen – je „Benutzer|Mappe“.
  const favoritSeit = new Map<string, string>();
  const favoritStumm = new Set<string>();
  const gesehen = new Map<string, string>();
  // Zähler-Endpunkt (#625): Stand der Zahlen je Benutzer.
  const zaehlerstaende = new Map<string, { stand: number; abdruck: string; geaendert: string }>();
  // Erkennung (#336): Ergebnis je Post.
  const erkennungen = new Map<string, { ergebnis: unknown; absenderId: string | null; zeit: string }>();
  /** Aufgaben bei Personen ohne Leserecht (#798). */
  const faelle = new Map<string, FallOhneLeserecht>();
  /** Notizen (#55). */
  const notizen = new Map<string, Notiz>();
  /** Hinweise von Paketen (#1034): Schlüssel `mappe|paket|schluessel`. */
  const hinweise = new Map<string, { mappeId: string; paket: string; schluessel: string; text: string; gesetzt: string }>();
  /** Mappen-Abläufe (#1044; früher freie Erinnerungen, #131). */
  const ablaeufe = new Map<string, MappenAblauf>();
  /** Automatisierungsvorlagen (#1044): gespeicherte Vorlagen, Änderungsverlauf, Verlauf. */
  const vorlagen = new Map<string, Ablaufvorlage>();
  const synonymListe: Synonymgruppe[] = [];
  const notfallListe: Notfallkontakt[] = [];

  return {
    aufgaben,
    favoriten,
    favoritSeit,
    favoritStumm,
    gesehen,
    zaehlerstaende,
    erkennungen,
    faelle,
    notizen,
    hinweise,
    ablaeufe,
    vorlagen,
    synonymListe,
    notfallListe,
    ablaufVerlauf: [] as AblaufVerlauf[],
  };
}

/** Pakete, Sprachpakete, Verlauf der Pakete (#1003), Ereignisse und Ereigniskatalog (#670). */
export function paketZustand() {
  const pakete = new Map<string, InstalliertesPaket>();
  const paketCode = new Map<string, Array<{ name: string; inhalt: Buffer }>>();
  const sprachpakete = new Map<string, import('..').SprachpaketDaten>();
  // Verlauf der Pakete (#1003).
  const verlauf: Array<VerlaufEintrag & { paket: string }> = [];
  const ereignisse = new Map<
    string,
    {
      id: string;
      paketId: string;
      art: string;
      daten: Record<string, unknown>;
      erstellt: string;
      faellig: number;
      versuche: number;
      zugestellt: string | null;
      fehler: string | null;
    }
  >();
  // Ereigniskatalog (#670)
  const katalog = new Map<
    string,
    {
      id: string;
      nr: number;
      art: string;
      daten: Record<string, unknown>;
      ausloeser: Record<string, unknown>;
      buendel: string | null;
      erstellt: string;
      faellig: number;
      gesperrtBis: number;
      versuche: number;
      fehler: string | null;
      verteilt: string | null;
    }
  >();
  const fristMeldungen = new Set<string>();

  return {
    pakete,
    paketCode,
    sprachpakete,
    verlauf,
    ereignisse,
    katalog,
    fristMeldungen,
    verlaufNr: 1,
    katalogNr: 0,
  };
}

export type SpeicherZustand = ReturnType<typeof ablageZustand> & ReturnType<typeof arbeitZustand> & ReturnType<typeof paketZustand>;
