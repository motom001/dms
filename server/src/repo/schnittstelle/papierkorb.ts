/** Schnittstelle des Repos (#1278 aus repo/index.ts): Abruf-Links einer Auskunft, Papierkorb und Löschprotokoll. */
import type { AuskunftLinkIntern, PapierkorbFilter, PapierkorbEintrag, DokumentImPapierkorb, KorbInhalt } from './typen';
import type { LoeschDokument, LoeschEintrag, LoeschFilter } from '../../../../shared/src/loeschprotokoll';

/** Abruf-Links einer Auskunft (#455), Papierkorb (#43), Löschprotokoll (#470). */
export interface RepoPapierkorb {
  /* ---------- Abruf-Links einer Auskunft (#455) ---------- */
  legeAuskunftLinkAn(l: AuskunftLinkIntern): Promise<void>;
  /** Über den Hash des Schlüssels (öffentliche Abrufseite). */
  auskunftLinkPerSchluessel(schluesselHash: string): Promise<AuskunftLinkIntern | undefined>;
  /** Neueste zuerst; ohne Angabe alle (höchstens `max`). */
  auskunftLinks(f?: { id?: string; mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLinkIntern[]>;
  /** Fehlversuch zählen (atomar); ab `max` gesperrt. Liefert den neuen Stand. */
  auskunftLinkFehlversuch(id: string, max: number): Promise<{ fehlversuche: number; gesperrt: boolean } | undefined>;
  /** Einen Abruf zählen – nur, solange der Link gilt (atomar). Liefert die neue Anzahl oder null. */
  auskunftLinkAbruf(id: string): Promise<number | null>;
  /** Zurückziehen; false, wenn er schon nicht mehr galt. */
  widerrufeAuskunftLink(id: string): Promise<boolean>;

  /* ---------- Papierkorb (#43) ---------- */
  /** Zieht die Mappe samt Verweisen und Dokumenten in den Papierkorb. */
  legeInPapierkorb(id: string, benutzerId: string | null): Promise<void>;
  papierkorb(f?: PapierkorbFilter): Promise<PapierkorbEintrag[]>;
  holeAusPapierkorb(id: string): Promise<PapierkorbEintrag | undefined>;
  /** Legt die Mappe wieder an; Verweise auf Mappen, die es nicht mehr gibt, entfallen (Anzahl). */
  stelleWiederHer(id: string): Promise<{ verweiseEntfallen: number }>;
  /**
   * Mit verknüpften Mappen löschen (#424): alle in einer Transaktion in den Papierkorb, als ein Vorgang –
   * auch bei Kreisen (Verweise untereinander gehen mit). `entkoppelt`: je Mappe die entfernten Verweise.
   */
  legeVorgangInPapierkorb(
    ids: string[],
    benutzerId: string | null,
    vorgang: string,
    entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>>,
  ): Promise<void>;
  /** Mehrere zusammen wiederherstellen (#424): erst alle Mappen, dann die Verweise (auch untereinander). */
  stelleMehrereWiederHer(ids: string[]): Promise<{ verweiseEntfallen: number }>;
  /** Löscht endgültig; liefert die Prüfwerte der Dateien, die dabei frei werden könnten. */
  leerePapierkorb(ids: string[]): Promise<string[]>;
  /** Mappen und einzelne Dokumente (#344). */
  zaehlePapierkorb(von?: string): Promise<number>;
  /** Hängt noch ein Dokument (lebend oder im Papierkorb) an dieser Datei? */
  dateiBenutzt(sha256: string): Promise<boolean>;
  /* Einzelne Dokumente (#344): samt Volltext und älteren Versionen. */
  legeDokumentInPapierkorb(id: string, benutzerId: string | null): Promise<void>;
  papierkorbDokumente(f?: PapierkorbFilter & { mappeIds?: string[] }): Promise<DokumentImPapierkorb[]>;
  holeDokumentAusPapierkorb(id: string): Promise<DokumentImPapierkorb | undefined>;
  /** Legt das Dokument wieder an (die Mappe muss es geben). */
  stelleDokumentWiederHer(id: string): Promise<void>;
  /** Löscht endgültig; liefert die Prüfwerte der Dateien, die dabei frei werden könnten. */
  leereDokumentPapierkorb(ids: string[]): Promise<string[]>;

  /* ---------- Löschprotokoll (#470) ---------- */
  /** Was mit Mappen im Papierkorb endgültig geht: Zahlen und Prüfsummen, keine Namen. */
  papierkorbInhalt(ids: string[]): Promise<KorbInhalt[]>;
  /** Einzelne Dokumente im Papierkorb samt älterer Versionen, ohne Namen. */
  papierkorbDokumentInhalt(ids: string[]): Promise<Array<{ id: string; mappeId: string; dokumente: LoeschDokument[] }>>;
  /** Nur anfügen – ändern oder einzeln löschen lässt sich nichts. */
  loeschprotokollSchreibe(e: LoeschEintrag[]): Promise<void>;
  /** Neueste zuerst, höchstens f.max; gesamt = alle passenden. */
  loeschprotokoll(f: LoeschFilter): Promise<{ eintraege: LoeschEintrag[]; gesamt: number }>;
  /** Einträge vor diesem Zeitpunkt entfernen (eigene Aufbewahrung); liefert die Anzahl. */
  loeschprotokollAufraeumen(vor: string): Promise<number>;
}
