/** Schnittstelle des Repos (#1278 aus repo/index.ts): Dokumente, Versionen, Demo-Daten und Fassungen. */
import type { Dokument, DokumentVersion } from '../../../../shared/src/model';
import type { NeueVersion } from './typen';
import type { FassungArt, GespeicherteFassung, Loeschvermerk } from '../../../../shared/src/fassungen';
import type { GelesenerCode } from '../../../../shared/src/codes';

/** Dokumente und ihre Versionen (#194), Demo-Daten, Fassungen (#1006). */
export interface RepoDokumente {
  listeDokumente(mappeId: string): Promise<Dokument[]>;
  /** Dokumente mehrerer Mappen in einem Zugriff (#367: Export ohne N+1), je Mappe neueste zuerst. */
  dokumenteVon(mappeIds: string[]): Promise<Dokument[]>;
  /** Anzahl (lebender) Dokumente je Mappe (#396); Mappen ohne fehlen. */
  zaehleDokumente(mappeIds: string[]): Promise<Map<string, number>>;
  holeDokument(id: string): Promise<Dokument | undefined>;
  /**
   * Aktuelle Mappe je Dokument (#1688): für den Vektor-Index, der nach Zuordnen oder Verschieben sonst die alte Mappe
   * kennt. Gelöschte und unbekannte Dokumente fehlen.
   */
  mappenVonDokumenten(ids: string[]): Promise<Map<string, string>>;
  legeDokumentAn(d: Dokument): Promise<Dokument>;
  /** „Hochgeladen am“ eines Dokuments setzen (#878: Beispiel-Dokumente mit Datum aus dem Paket). */
  setzeDokumentErstellt(id: string, erstellt: string): Promise<void>;
  /* ---------- Versionierung (#194) ---------- */
  /** Ältere Versionen, neueste zuerst. */
  versionenVon(dokumentId: string): Promise<DokumentVersion[]>;
  /** Ältere Versionen mehrerer Dokumente (#367), je Dokument neueste zuerst. */
  versionenVonDokumenten(dokumentIds: string[]): Promise<DokumentVersion[]>;
  /** Volltext einer älteren Version (für „Zurückholen“). */
  holeVersion(dokumentId: string, nummer: number): Promise<(DokumentVersion & { volltext: string | null }) | undefined>;
  /**
   * Neue Version: den aktuellen Stand als ältere Version sichern und das Dokument mit der neuen Datei
   * überschreiben (Nummer + 1). `volltext` gesetzt = übernommen (Zurückholen), sonst Texterkennung neu.
   */
  ersetzeDokument(id: string, neu: NeueVersion): Promise<Dokument>;
  /** Integritätsprüfung (#212): jede gespeicherte Datei (aktuelle und ältere Versionen) mit Dokument und Mappe. */
  alleDateien(): Promise<Array<{ sha256: string; groesse: number; dokumentId: string; mappeId: string; name: string; version: number }>>;
  /** Ältere Versionen über die letzten `behalten` hinaus entfernen; liefert deren Dateien (sha256). */
  kuerzeVersionen(dokumentId: string, behalten: number): Promise<string[]>;
  loescheDokument(id: string): Promise<void>;
  /**
   * Zuordnen (#192): Dokument samt Volltext in eine andere Mappe und ein anderes Register. Anlagen (#998) wandern mit;
   * eine Anlage, die ohne ihr Hauptdokument in eine andere Mappe kommt, ist danach ein eigenes Dokument.
   */
  verschiebeDokument(id: string, mappeId: string, registerKey: string): Promise<void>;
  /** Anlagen (#998): die Anlagen eines Dokuments, Anlage 1 zuerst. */
  anlagenVon(id: string): Promise<Dokument[]>;
  /**
   * Anlagen (#998): Dokument als Anlage `nr` an `anlageZu` hängen (null: zum eigenen Dokument machen); `name` benennt es
   * dabei um. Mappe und Register prüft der Dienst. false, wenn es das Dokument nicht gibt.
   */
  setzeAnlage(id: string, anlageZu: string | null, nr: number | null, name?: string): Promise<boolean>;
  /**
   * Dokument umbenennen (#1594): neuer Name; der bisherige bleibt als ursprünglicher Name, wenn es noch keinen gibt.
   * false, wenn es das Dokument nicht gibt.
   */
  benenneDokument(id: string, name: string): Promise<boolean>;
  /** Scan verkleinert (#1600): Auflösung des Originals (dpi) für die Datei mit diesem Prüfwert merken. */
  setzeVerkleinert(id: string, sha256: string, dpi: number): Promise<void>;
  /** Codes auf dem Dokument (#1723): gemerkt für die Datei mit Prüfwert `sha256`; null = noch nie gelesen. */
  liesCodes(id: string): Promise<{ sha256: string; codes: GelesenerCode[] } | null>;
  /** Codes merken (#1723) – nur, solange das Dokument noch die Datei mit diesem Prüfwert hat. */
  merkeCodes(id: string, sha256: string, codes: GelesenerCode[]): Promise<void>;
  /**
   * E-Mail-Postfach (#999): Platz in der Eingangsreihenfolge der Post (`nr`, null = keiner) und Kennzeichen
   * „Original-E-Mail“ setzen – was fehlt, bleibt. Auch beim Ersetzen ohne Versionierung (das neue Dokument übernimmt es).
   */
  setzeEingang(id: string, x: { nr?: number | null; originalEmail?: boolean; fuer?: string | null }): Promise<void>;
  /** Andere Dokumente mit derselben Datei (gleicher Inhalt). */
  dokumenteMitSha(sha256: string): Promise<Dokument[]>;
  /** Dateien umwandeln (#577): lebende Dokumente dieser Dateitypen, ältere zuerst. */
  dokumenteMitTyp(mimes: string[]): Promise<Dokument[]>;
  /** Dateien umwandeln (#577): Anzahl lebender Dokumente je Dateityp. */
  dokumentTypen(): Promise<Record<string, number>>;
  /** PDF verkleinern (#393): lebende PDF-Dokumente ab `ab` Bytes, größte zuerst, höchstens `max`. */
  grossePdfs(ab: number, max: number): Promise<Dokument[]>;
  /** Eine ältere Version entfernen (Verkleinern ohne Original); liefert ihre Datei (sha256) oder null. */
  loescheVersion(dokumentId: string, nummer: number): Promise<string | null>;
  /** Anzahl Dokumente je Register-Schlüssel in Mappen dieses Typs. */
  dokumenteJeRegister(typId: string): Promise<Map<string, number>>;

  /** Demo-Mappen je Typ. */
  zaehleDemo(): Promise<Map<string, number>>;
  /** Anzahl echter Mappen, die auf Demo-Mappen verweisen. */
  echteVerweiseAufDemo(): Promise<number>;
  /**
   * Löscht Demo-Mappen; liefert ihre Anzahl und die Prüfwerte ihrer Dateien. Mit `max` höchstens so
   * viele (#248: in Paketen); erst wenn keine mehr übrig ist, auch die Demo-Mappen im Papierkorb.
   */
  loescheDemo(max?: number): Promise<{ anzahl: number; dateien: string[] }>;

  /* ---------- Fassungen (#1006) ---------- */
  /** Fassungen eines Eintrags, neueste zuerst; höchstens `max`. */
  fassungen(art: FassungArt, eintrag: string, max?: number): Promise<GespeicherteFassung[]>;
  /** Anzahl Fassungen eines Eintrags. */
  zaehleFassungen(art: FassungArt, eintrag: string): Promise<number>;
  /** Eine Fassung; undefined, wenn es sie nicht gibt. */
  fassung(art: FassungArt, eintrag: string, nr: number): Promise<GespeicherteFassung | undefined>;
  /** Die neueste Fassung je Eintrag einer Art (Abgleich beim Start). */
  letzteFassungen(art: FassungArt): Promise<Map<string, GespeicherteFassung>>;
  legeFassungAn(f: GespeicherteFassung): Promise<void>;
  /** Fassung fortschreiben (Zusammenfassen): Stand, Name und letzte Änderung. */
  schreibeFassungFort(art: FassungArt, eintrag: string, nr: number, d: Pick<GespeicherteFassung, 'name' | 'daten' | 'bis'>): Promise<void>;
  loescheFassung(art: FassungArt, eintrag: string, nr: number): Promise<void>;
  /** Eintrag gelöscht: nur die neueste Fassung bleibt, mit Löschvermerk. */
  vermerkeLoeschung(art: FassungArt, eintrag: string, vermerk: Loeschvermerk): Promise<void>;
  /** Gelöschte Einträge mit ihrer letzten Fassung, neueste Löschung zuerst. */
  geloeschteFassungen(arten: readonly FassungArt[]): Promise<GespeicherteFassung[]>;
  /** Alle Fassungen (Vollexport), nach Art, Eintrag und Nummer. */
  alleFassungen(): Promise<GespeicherteFassung[]>;
}
