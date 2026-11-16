/** Schnittstelle des Repos (#1278 aus repo/index.ts): Erkennung, unscharfe Suche, Vektoren und Texterkennung. */
import type { Synonymgruppe, OcrErgebnis, OcrZaehler, OcrAuftrag, VolltextHerkunftZahlen } from './typen';
import type { Dokument, OcrStandArt, Mappe } from '../../../../shared/src/model';
import type { Seitensprache } from '../../../../shared/src/seitensprachen';
import type { Leerseiten } from '../../../../shared/src/leerseiten';
import type { Lesefilter } from '../../../../shared/src/rechte';

/** Erkennung (#336), unscharfe Suche (#356), Vektoren zu Dokumenten (#442), Texterkennung und Volltext (#45). */
export interface RepoVolltext {
  /* ---------- Erkennung (#336) ---------- */
  /** Gespeichertes Ergebnis der Erkennung einer Post. */
  erkennungLies(mappeId: string): Promise<{ ergebnis: unknown; zeit: string } | undefined>;
  /** Ergebnis speichern bzw. ersetzen; absenderId = eindeutig erkannter Absender. Gibt es die Mappe nicht (mehr), passiert nichts. */
  erkennungSchreibe(mappeId: string, ergebnis: unknown, absenderId: string | null): Promise<void>;
  /** Post mit diesem eindeutig erkannten Absender, neueste zuerst. */
  erkennungenMitAbsender(absenderId: string, max: number): Promise<string[]>;

  /* ---------- Unscharfe Suche (#356) ---------- */
  /** Ähnliche Wörter aus dem Wörterverzeichnis je Begriff (gefaltet), beste zuerst; ohne pg_trgm leer. */
  aehnlicheWoerter(woerter: string[], max: number): Promise<Record<string, string[]>>;
  /** Anzahl der Wörter im Wörterverzeichnis. */
  woerterAnzahl(): Promise<number>;
  /** Wörterverzeichnis aus dem Bestand neu aufbauen; liefert die Anzahl. */
  woerterNeu(): Promise<number>;
  /**
   * Neue Wörter aus dem Eingang ins Wörterverzeichnis übernehmen (#575, höchstens `grenze` Einträge); liefert deren
   * Zahl, -1 wenn gerade ein anderer Lauf arbeitet.
   */
  woerterEinarbeiten(grenze?: number): Promise<number>;
  /** Gruppen gleichbedeutender Wörter (Werkbank und Pakete). */
  synonyme(): Promise<Synonymgruppe[]>;
  legeSynonymAn(g: { id: string; woerter: string[]; quelle: string }): Promise<void>;
  /**
   * Eigene Gruppe ändern (nur quelle „werkbank“); false, wenn es sie nicht gibt. Mit `erwartet` (#917, ihr `geaendert`,
   * auf dem die Bearbeitung beruht) nur, wenn seitdem niemand gespeichert hat – sonst `KonfigurationVeraltet`.
   */
  aendereSynonym(id: string, woerter: string[], erwartet?: string): Promise<boolean>;
  loescheSynonym(id: string): Promise<boolean>;
  /** Alle Gruppen einer Quelle (Paket-Id) ersetzen – leer = entfernen. */
  setzeSynonyme(quelle: string, gruppen: string[][]): Promise<void>;

  /* ---------- Vektoren zu Dokumenten (#442) ---------- */
  /** Vektor eines Dokuments für ein Modell setzen bzw. ersetzen. Gibt es das Dokument nicht (mehr): false. */
  vektorSetze(e: { dokumentId: string; paket: string; modell: string; vektor: Float32Array }): Promise<boolean>;
  /** Vektor(en) eines Dokuments löschen – eines Modells oder alle; liefert die Anzahl. */
  vektorLoesche(dokumentId: string, modell?: string): Promise<number>;
  /** Vektoren eines Pakets löschen, außer denen des Modells `ausser` (Modellwechsel, Neuberechnung); liefert die Anzahl. */
  vektorenLoeschePaket(paket: string, ausser?: string): Promise<number>;
  /** Alle Vektoren eines Modells mit der Mappe des Dokuments, in Teilen (für den Zwischenspeicher, ohne alles auf einmal im Speicher). */
  vektorenLaden(
    modell: string,
    jeTeil: (teil: Array<{ dokumentId: string; mappeId: string; vektor: Float32Array }>) => void,
  ): Promise<void>;
  /** Vektor eines Dokuments für ein Modell. */
  vektorVon(dokumentId: string, modell: string): Promise<Float32Array | null>;
  /** Anzahl je Paket und Modell. */
  vektorStand(): Promise<Array<{ paket: string; modell: string; anzahl: number }>>;
  /** Dokumente mit Volltext, aber ohne Vektor dieses Modells (nach Id, ab `nach`) – für die Nachberechnung des Bestands. */
  ohneVektor(modell: string, max: number, nach?: string | null): Promise<Array<{ id: string; mappeId: string }>>;
  /** Anzahl der Dokumente mit Volltext. */
  mitVolltext(): Promise<number>;

  /* ---------- Texterkennung (#45) ---------- */
  /** Dokumente in die Warteschlange stellen. */
  ocrEinreihen(ids: string[]): Promise<void>;
  /** Nimmt das älteste wartende Dokument und setzt es auf „läuft“. */
  ocrNaechster(): Promise<Dokument | undefined>;
  ocrSetze(id: string, e: OcrErgebnis): Promise<void>;
  /** Fertiger Volltext eines anderen Dokuments mit derselben Datei. */
  ocrVonSha(
    sha256: string,
    ausser: string,
  ): Promise<
    | {
        text: string;
        seiten: number | null;
        info: string | null;
        sprache?: string | null;
        weitere?: string[] | null;
        seitensprachen?: Seitensprache[] | null;
      }
    | undefined
  >;
  /**
   * Sprache eines Dokuments setzen (#400); false, wenn es das Dokument nicht gibt. Mit `weitere` (#579) auch die
   * weiteren Sprachen – die Seitensprachen entfallen dann (die Angabe gilt fürs ganze Dokument).
   */
  setzeDokumentSprache(id: string, sprache: string | null, weitere?: string[]): Promise<boolean>;
  /** Seitensprachen eines Dokuments (#579), null ohne. */
  seitensprachen(id: string): Promise<Seitensprache[] | null>;
  /** Hinweis „Post teilen?“ an einem Dokument wegklicken (#579); false, wenn es das Dokument nicht gibt. */
  teilenHinweisAus(id: string): Promise<boolean>;
  /**
   * Leerseiten eines Dokuments setzen oder (null) entfernen (#997); false, wenn es das Dokument nicht gibt oder – beim
   * Setzen – seine Datei inzwischen eine andere ist (`l.sha256`).
   */
  setzeLeerseiten(id: string, l: Leerseiten | null): Promise<boolean>;
  /** Nach einem Neustart: „läuft“ → „wartet“. */
  ocrZurueckstellen(): Promise<number>;
  ocrZaehler(): Promise<OcrZaehler>;
  /** Aufträge der Texterkennung für die Werkbank (#61): Dokumente eines Stands mit Mappe, neueste zuerst. */
  ocrAuftraege(f: { stand: OcrStandArt; von: number; anzahl: number }): Promise<{ gesamt: number; eintraege: OcrAuftrag[] }>;
  /** Dokumente ohne Volltext (noch nie erkannt) mit Typ und Register ihrer Mappe. */
  ocrOhneVolltext(): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  /**
   * „Volltext neu erzeugen“ (#458): Dokumente ohne Text (Volltext leer, gleich welcher Stand außer wartet/läuft)
   * bzw. alle Dokumente, mit Typ und Register ihrer Mappe, ältere zuerst.
   */
  volltextKandidaten(umfang: 'ohne' | 'alle'): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  /**
   * Woher der Volltext fertiger Dokumente kommt (#459, Werkbank → Texterkennung): Textebene des PDFs, Paket, API,
   * frühere eingebaute Texterkennung, sonst (z. B. nach dem Schwärzen) – und fertige ohne Text. Wie volltextHerkunft
   * (shared/src/volltext.ts) aus dem Hinweis gelesen.
   */
  volltextHerkunft(): Promise<VolltextHerkunftZahlen>;
  /** Erkannte Sprachen (#395): Anzahl fertiger Dokumente je Sprachkennung (aus dem Hinweis der Texterkennung). */
  ocrSprachen(): Promise<Record<string, number>>;
  volltext(id: string): Promise<string | null>;
  /** Volltexte mehrerer Dokumente (#367); Dokumente ohne Volltext fehlen. Listen lesen ihn nie mit. */
  volltexte(ids: string[]): Promise<Map<string, string>>;
  /**
   * „Frag deine Ablage“ (#444): Fundstellen zu Suchwörtern – nur in Mappen, die `lesen` erlaubt. dokumente: beste
   * Dokumente (Volltext, ein Wort genügt) mit Ausschnitten um die Treffer; mappen: Mappen, deren Titel oder Werte
   * Wörter enthalten (meiste Wörter zuerst). woerter: nur Buchstaben und Ziffern (frageWoerter).
   */
  fragenFundstellen(o: {
    woerter: string[];
    lesen: Lesefilter | null;
    dokumente: number;
    mappen: number;
  }): Promise<{ dokumente: Array<{ id: string; mappeId: string; name: string; text: string }>; mappen: Mappe[] }>;
}
