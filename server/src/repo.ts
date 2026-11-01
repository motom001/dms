import type { Aufgabe, Ausschnitt, Dokument, DokumentVersion, Herkunft, Historienart, Historieneintrag, Mappe, Notiz, MappenBezug, Mappentyp, MappentypDaten, OcrStandArt, Systemtyp, Werte } from '../../shared/src/model';
import type { Klausel, Sicht, SichtDaten } from '../../shared/src/sichten';
import type { Ausdruck, Lesefilter, Regelwerk } from '../../shared/src/rechte';
import type { Erinnerung } from '../../shared/src/fristen';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import type { AuskunftLink } from '../../shared/src/auskunft';
import type { Fundstelle } from './geheimnisse';

export interface Verweis { feldKey: string; zielId: string }
/** Abruf-Link (#455) mit den Hashes von Schlüssel und Abrufcode – verlässt den Server nie. */
export interface AuskunftLinkIntern extends AuskunftLink { schluessel: string; code: string }
/** Ein gespeicherter Verweis mit beiden Enden (#396). */
export interface Kante { quelleId: string; feldKey: string; zielId: string }
/** Sortierung, wie sie das Repo braucht: Art der Spalte (für den richtigen Vergleich) und ggf. Feldschlüssel. */
export interface SortierungIntern {
  art: 'titel' | 'typ' | 'erstellt' | 'geaendert' | 'erstelltVon' | 'geaendertVon' | 'text' | 'zahl' | 'betrag' | 'datum' | 'janein';
  key?: string;
  absteigend: boolean;
}
export interface SeitenAnfrage {
  /** Mappen dieses Typs … */
  typId?: string;
  /** … oder der Eingang dieses Benutzers (nicht passende eigene Mappen; ohne Ersteller beim Admin). */
  eingang?: { benutzerId: string; admin: boolean };
  /** … oder die Favoriten dieses Benutzers (#62). */
  favoriten?: { benutzerId: string };
  /** … oder die Mappen einer Sicht (#38): ODER der Klauseln, Bedingungen aufgelöst. */
  klauseln?: Klausel[];
  /** Suche in Titel und Werten. */
  suche?: string;
  /** Suche auch im Volltext der Dokumente (deutsche Volltextsuche, #45). */
  volltext?: boolean;
  /** Suche auch in Notizen (#55). */
  notizen?: boolean;
  /** Erweiterte Suche (#199): der Begriff muss in Dokumenten und/oder Notizen stehen – UND mit allem anderen. */
  textfilter?: { text: string; dokumente: boolean; notizen: boolean };
  /** Reihenfolge; ohne: nach Titel. */
  sortierung?: SortierungIntern;
  /** Berechtigungen (#124): nur lesbare Mappen; fehlt/null = alle. */
  lesen?: Lesefilter | null;
  von: number;
  anzahl: number;
}
export interface NeueMappe {
  id: string; typId: string; werte: Werte; verweise: Verweis[]; titel: string; benutzerId: string | null; demo: boolean;
}

/** Ergebnis der Texterkennung für ein Dokument. */
export interface OcrErgebnis { stand: OcrStandArt; text?: string | null; info?: string | null; seiten?: number | null }
export type OcrZaehler = Record<OcrStandArt, number>;

/** Ein Dokument in der Liste der Texterkennung (#61). */
export interface OcrAuftrag { dokument: Dokument; mappeTitel: string; typId: string }
export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }

/** Eine Mappe im Papierkorb (#43), mit ihren Werten, wie sie beim Löschen waren. */
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null;
  /** Anzahl Dokumente, die mit ihr im Papierkorb liegen. */
  dokumente: number;
  /** Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs, sonst null. */
  vorgang: string | null;
  /** Verweise bleibender Mappen auf diese, die beim Löschen entfernt wurden (#424). */
  entkoppelt: Array<{ quelleId: string; feldKey: string }>;
}
/** Ein einzelnes Dokument im Papierkorb (#344). */
export interface DokumentImPapierkorb {
  id: string; mappeId: string; registerKey: string; name: string; mime: string; groesse: number; sha256: string;
  erstellt: string; erstelltVon: string | null;
  /** Anzahl älterer Versionen, die mitgegangen sind. */
  versionen: number;
  geloescht: string; geloeschtVon: string | null;
}
export interface PapierkorbFilter {
  /** Nur, was dieser Benutzer gelöscht hat. */
  von?: string;
  /** Nur, was vor diesem Zeitpunkt gelöscht wurde. */
  vor?: string;
  typId?: string;
}

/**
 * Datenzugriff für einen Haushalt. Die Fachlogik (Dienst) kennt nur diese
 * Schnittstelle; PostgreSQL und der Arbeitsspeicher (für Tests) setzen sie um.
 */
/** Ein Ereignis für ein Paket (#338). */
export interface PaketEreignis { id: string; paketId: string; art: string; daten: Record<string, unknown>; erstellt: string; versuche: number }

export interface Repo {
  /**
   * Mehrere Änderungen ganz oder gar nicht (#404), z. B. eine Änderung samt Ereignis im Ausgangskorb:
   * `f` bekommt ein Repo, das in der Transaktion arbeitet. Im Speicher-Repo (Tests) ohne Zurückrollen.
   */
  transaktion<T>(f: (repo: Repo) => Promise<T>): Promise<T>;
  listeTypen(): Promise<Mappentyp[]>;
  holeTyp(id: string): Promise<Mappentyp | undefined>;
  /** `system` nur für die Systemtypen, die der Server selbst anlegt. */
  legeTypAn(id: string, d: MappentypDaten, system?: Systemtyp): Promise<Mappentyp>;
  /** Aktualisiert den Typ und entfernt Verweise aus Feldern, die keine Referenzfelder mehr sind. */
  aendereTyp(id: string, d: MappentypDaten): Promise<Mappentyp>;
  loescheTyp(id: string): Promise<void>;
  zaehleMappen(typId: string): Promise<number>;

  listeMappen(typId?: string): Promise<Mappe[]>;
  /** Nur Id, Typ und Titel aller Mappen (Demo-Daten, #248: auch bei 200.000 Mappen schlank). */
  mappenKurz(): Promise<Array<{ id: string; typId: string; titel: string }>>;
  /** Vorhandene Werte eines Feldes (für eindeutige Felder beim Erzeugen von Demo-Daten). */
  feldwerte(typId: string, key: string): Promise<string[]>;
  holeMappe(id: string): Promise<Mappe | undefined>;
  /** `nummern` (#171): in derselben Transaktion je Feld eine Nummer aus dem Kreis ziehen und eintragen. */
  legeMappeAn(id: string, typId: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, demo?: boolean, systemKennung?: string | null, nummern?: NummernZiehen): Promise<Mappe>;
  /* ---------- Pakete (#188) ---------- */
  listePakete(): Promise<InstalliertesPaket[]>;
  /** Anlegen oder ersetzen (gleiche Id). */
  speicherePaket(p: InstalliertesPaket): Promise<void>;
  loeschePaket(id: string): Promise<void>;
  /** Code eines Pakets (#338): code/modul.wasm und code/daten/…; ersetzt den bisherigen ganz. */
  speicherePaketCode(paketId: string, dateien: Array<{ name: string; inhalt: Buffer }>): Promise<void>;
  paketCode(paketId: string): Promise<Array<{ name: string; inhalt: Buffer }>>;
  loeschePaketCode(paketId: string): Promise<void>;
  /** Ereignisse für Pakete (#338): Ausgangskorb mit Wiederholung. */
  legeEreignisseAn(e: Array<{ id: string; paketId: string; art: string; daten: Record<string, unknown> }>): Promise<void>;
  /** Fällige, noch nicht zugestellte Ereignisse, älteste zuerst. */
  faelligeEreignisse(anzahl: number): Promise<PaketEreignis[]>;
  ereignisZugestellt(id: string): Promise<void>;
  /** Fehlschlag merken; naechster null = aufgeben. */
  ereignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null): Promise<void>;
  /** Je Paket: offen, aufgegeben, zuletzt zugestellt. */
  ereignisStand(): Promise<Record<string, { offen: number; aufgegeben: number; zugestellt: number }>>;
  /** Alle Ereignisse eines entfernten Pakets verwerfen. */
  loescheEreignisse(paketId: string): Promise<void>;
  /* ---------- Nummernkreise (#171) ---------- */
  listeNummernkreise(): Promise<Nummernkreis[]>;
  /** Anlegen oder Name, Muster und Start ändern; Zählerstände bleiben. */
  speichereNummernkreis(k: Pick<Nummernkreis, 'schluessel' | 'name' | 'muster' | 'start'>): Promise<Nummernkreis>;
  loescheNummernkreis(schluessel: string): Promise<void>;
  /** Zählerstand eines Zeitraums setzen (zuletzt vergebener Wert). */
  setzeZaehler(schluessel: string, zeitraum: string, letzter: number): Promise<Nummernkreis | undefined>;
  /** Einer vorhandenen Mappe eine Nummer geben, wenn das Feld leer ist (Wartung); sonst null. */
  vergebeNummer(mappeId: string, feldKey: string, kreis: string, jetzt: Date): Promise<string | null>;
  /** Archivnummern (#345): `anzahl` Nummern aus einem Kreis ziehen (ohne Mappe), in einer Transaktion. */
  zieheNummern(kreis: string, anzahl: number, jetzt: Date): Promise<string[]>;
  /** Archivnummer setzen (null = entfernen); false, wenn ein anderes Dokument sie schon hat. */
  setzeArchivnummer(dokumentId: string, nummer: string | null): Promise<boolean>;
  /** Dokument mit dieser Archivnummer (ohne Groß-/Kleinschreibung). */
  findeArchivnummer(nummer: string): Promise<Dokument | undefined>;
  /** Die Mappe mit dieser Systemkennung (z. B. rolle:admin). */
  holeSystemMappe(kennung: string): Promise<Mappe | undefined>;
  aendereMappe(id: string, werte: Werte, verweise: Verweis[], benutzerId: string | null): Promise<Mappe>;
  /** Setzt nur „zuletzt geändert“ (z. B. nach Dokumenten, #76); Werte, Verweise und Passung bleiben. */
  beruehreMappe(id: string, benutzerId: string | null): Promise<void>;
  /** Viele neue Mappen auf einmal (Demo-Daten): eine Transaktion, Titel schon berechnet. */
  legeMappenAn(liste: NeueMappe[]): Promise<void>;
  /** Statistik der großen Tabellen auffrischen (ANALYZE, #367) – nach Massenläufen wie Demo-Daten. */
  aktualisiereStatistik(): Promise<void>;
  loescheMappe(id: string): Promise<void>;

  /** Mehrere Mappen auf einmal (unbekannte Ids fehlen im Ergebnis). */
  holeMappen(ids: string[]): Promise<Mappe[]>;
  /** Gespeicherte Titel (leer, wenn noch nicht berechnet). */
  titelVon(ids: string[]): Promise<Map<string, string>>;
  setzeTitel(liste: Array<{ id: string; titel: string }>): Promise<void>;
  /** Ids der Mappen, die auf eine der angegebenen verweisen. */
  quellenVon(zielIds: string[]): Promise<string[]>;
  /** Titel und Typ je Mappe (unbekannte Ids fehlen). */
  bezuege(ids: string[]): Promise<Map<string, MappenBezug>>;
  /** Eine Seite einer Sicht, sortiert nach Titel. */
  seite(o: SeitenAnfrage): Promise<{ gesamt: number; mappen: Mappe[]; ausschnitte?: Record<string, Ausschnitt> }>;
  /** Zähler für die Sichten. */
  zaehler(benutzerId: string, admin: boolean, lesen?: Lesefilter | null): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number; favoriten: number }>;
  /** Favoriten (#62): setzen/entfernen; welche der Mappen Favoriten des Benutzers sind. */
  setzeFavorit(benutzerId: string, mappeId: string, an: boolean): Promise<void>;
  /** Vollexport (#254): alle Favoriten. */
  alleFavoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;

  /* ---------- Abruf-Links einer Auskunft (#455) ---------- */
  legeAuskunftLinkAn(l: AuskunftLinkIntern): Promise<void>;
  /** Über den Hash des Schlüssels (öffentliche Abrufseite). */
  auskunftLinkPerSchluessel(schluesselHash: string): Promise<AuskunftLinkIntern | undefined>;
  /** Neueste zuerst; ohne Angabe alle (höchstens `max`). */
  auskunftLinks(f?: { mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLinkIntern[]>;
  /** Fehlversuch zählen (atomar); ab `max` gesperrt. Liefert den neuen Stand. */
  auskunftLinkFehlversuch(id: string, max: number): Promise<{ fehlversuche: number; gesperrt: boolean } | undefined>;
  /** Einen Abruf zählen – nur, solange der Link gilt (atomar). Liefert die neue Anzahl oder null. */
  auskunftLinkAbruf(id: string): Promise<number | null>;
  /** Zurückziehen; false, wenn er schon nicht mehr galt. */
  widerrufeAuskunftLink(id: string): Promise<boolean>;
  favoritenVon(benutzerId: string, mappeIds: string[]): Promise<Set<string>>;
  /** Anzahl Mappen je Klauselliste (eine je Sicht), in derselben Reihenfolge. */
  zaehleKlauseln(liste: Klausel[][], lesen?: Lesefilter | null): Promise<number[]>;
  /** Berechtigungen (#124): welche dieser Mappen der Filter durchlässt. */
  lesbare(ids: string[], lesen: Lesefilter | null): Promise<Set<string>>;
  /** Exportrecht (#294): welche dieser Mappen zu mindestens einer der Klauseln passen. */
  inKlauseln(ids: string[], klauseln: Klausel[]): Promise<Set<string>>;
  /** Anzahl Mappen eines Typs, für die der Ausdruck gilt (z. B. „niemand kann lesen“, #125). */
  zaehleAusdruck(typId: string, x: Ausdruck): Promise<number>;
  /** Regelwerk eines Mappentyps speichern; null = alles erteilt, keine Regeln. */
  setzeBerechtigungen(typId: string, rw: Regelwerk | null): Promise<Mappentyp>;
  /** Schlüssel nachtragen (#145; nur für Typen ohne). */
  setzeTypSchluessel(typId: string, schluessel: string): Promise<void>;

  listeSichten(): Promise<Sicht[]>;
  legeSichtAn(id: string, d: SichtDaten): Promise<Sicht>;
  aendereSicht(id: string, d: SichtDaten): Promise<Sicht>;
  loescheSicht(id: string): Promise<void>;
  /** problem null = passt. */
  setzePassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  /** Ids der Mappen dieses Typs, die nicht passen. */
  unpassende(typId: string): Promise<string[]>;
  /** Typen mit noch nicht geprüften Mappen. */
  typenOhnePassung(): Promise<string[]>;
  /** Anzahl Mappen mit Wert je Feldschlüssel. */
  belegung(typId: string): Promise<Record<string, number>>;
  /** Ids der Mappen, deren Titel noch nie berechnet wurde. */
  ohneTitel(): Promise<string[]>;

  /** Typ-Id je existierender Mappe dieses Haushalts. */
  typenVon(ids: string[]): Promise<Map<string, string>>;
  /** Eine andere Mappe desselben Typs mit gleichem Wert (Groß-/Kleinschreibung egal). */
  findeDoppelt(typId: string, feldKey: string, wert: string, ausser?: string): Promise<Mappe | undefined>;
  rueckverweise(zielId: string): Promise<Rueckverweis[]>;
  /** Baum-Sammlung (#396, #424): alle Verweise, deren Quelle oder Ziel eine dieser Mappen ist (beide Richtungen). */
  kantenVon(ids: string[]): Promise<Kante[]>;

  listeDokumente(mappeId: string): Promise<Dokument[]>;
  /** Dokumente mehrerer Mappen in einem Zugriff (#367: Export ohne N+1), je Mappe neueste zuerst. */
  dokumenteVon(mappeIds: string[]): Promise<Dokument[]>;
  /** Anzahl (lebender) Dokumente je Mappe (#396); Mappen ohne fehlen. */
  zaehleDokumente(mappeIds: string[]): Promise<Map<string, number>>;
  holeDokument(id: string): Promise<Dokument | undefined>;
  legeDokumentAn(d: Dokument): Promise<Dokument>;
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
  /** Zuordnen (#192): Dokument samt Volltext in eine andere Mappe und ein anderes Register. */
  verschiebeDokument(id: string, mappeId: string, registerKey: string): Promise<void>;
  /** Andere Dokumente mit derselben Datei (gleicher Inhalt). */
  dokumenteMitSha(sha256: string): Promise<Dokument[]>;
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
  legeVorgangInPapierkorb(ids: string[], benutzerId: string | null, vorgang: string, entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>>): Promise<void>;
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

  /* ---------- Texterkennung (#45) ---------- */
  /** Dokumente in die Warteschlange stellen. */
  ocrEinreihen(ids: string[]): Promise<void>;
  /** Nimmt das älteste wartende Dokument und setzt es auf „läuft“. */
  ocrNaechster(): Promise<Dokument | undefined>;
  ocrSetze(id: string, e: OcrErgebnis): Promise<void>;
  /** Fertiger Volltext eines anderen Dokuments mit derselben Datei. */
  ocrVonSha(sha256: string, ausser: string): Promise<{ text: string; seiten: number | null; info: string | null } | undefined>;
  /** Nach einem Neustart: „läuft“ → „wartet“. */
  ocrZurueckstellen(): Promise<number>;
  ocrZaehler(): Promise<OcrZaehler>;
  /** Aufträge der Texterkennung für die Werkbank (#61): Dokumente eines Stands mit Mappe, neueste zuerst. */
  ocrAuftraege(f: { stand: OcrStandArt; von: number; anzahl: number }): Promise<{ gesamt: number; eintraege: OcrAuftrag[] }>;
  /** Dokumente ohne Volltext (noch nie erkannt) mit Typ und Register ihrer Mappe. */
  ocrOhneVolltext(): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  /** Erkannte Sprachen (#395): Anzahl fertiger Dokumente je Sprachkennung (aus dem Hinweis der Texterkennung). */
  ocrSprachen(): Promise<Record<string, number>>;
  volltext(id: string): Promise<string | null>;
  /** Volltexte mehrerer Dokumente (#367); Dokumente ohne Volltext fehlen. Listen lesen ihn nie mit. */
  volltexte(ids: string[]): Promise<Map<string, string>>;

  /* ---------- Aufgaben (#54) ---------- */
  /** Passung → Aufgaben: offene „passt nicht“-Aufgabe anlegen oder Text nachziehen; passt sie, erledigt. */
  aufgabenZurPassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  legeAufgabeAn(a: Aufgabe): Promise<Aufgabe>;
  holeAufgabe(id: string): Promise<Aufgabe | undefined>;
  /** Aufgaben einer Mappe (offen und erledigt), neueste zuerst. */
  aufgabenVon(mappeId: string): Promise<Aufgabe[]>;
  /** Aufgaben mehrerer Mappen (#367), je Mappe wie `aufgabenVon`. */
  aufgabenVonMappen(mappeIds: string[]): Promise<Aufgabe[]>;
  /** Offene Aufgaben: alle, oder die eines Benutzers (mit admin auch die der Administratoren). */
  offeneAufgaben(f?: { benutzerId?: string; admin?: boolean; mappeIds?: string[] }): Promise<Aufgabe[]>;
  /** Erledigte Aufgaben (Werkbank), neueste zuerst. */
  erledigteAufgaben(max: number): Promise<Aufgabe[]>;
  erledigeAufgabe(id: string, von: string | null): Promise<void>;
  delegiereAufgabe(id: string, an: string | null): Promise<void>;
  /** Text einer offenen Aufgabe ersetzen – für gebündelte Benachrichtigungen, die hochzählen (#415, #422). */
  aendereAufgabeText(id: string, text: string): Promise<void>;
  /** Fristen (#129): alle Aufgaben der Art „frist“ (offen und erledigt), ggf. nur dieser Mappen. */
  fristAufgaben(mappeIds?: string[]): Promise<Aufgabe[]>;

  /**
   * Schlüsselwechsel (#47): alle verschlüsselten Werte (Mappen, Papierkorb, Einstellungen) umschlüsseln
   * und die angegebenen Einstellungen setzen – in einer Transaktion.
   */
  umschluesseln(um: (wert: string) => string | null, einstellungen: Record<string, unknown>): Promise<{ umgeschluesselt: number; unlesbar: number }>;
  /**
   * Alle verschlüsselten Werte mit Fundstelle (#410) – genau die, die `umschluesseln` anfasst
   * (Mappen, Papierkorb, Einstellungen außer den beim Wechsel neu gesetzten).
   */
  verschluesselteFundstellen(): Promise<Fundstelle[]>;

  /* ---------- Freie Erinnerungen (#131), solange nicht fällig ---------- */
  erinnerungen(f?: { mappeId?: string; empfaengerId?: string; bis?: string }): Promise<Erinnerung[]>;
  holeErinnerung(id: string): Promise<Erinnerung | undefined>;
  legeErinnerungAn(e: Erinnerung): Promise<Erinnerung>;
  aendereErinnerung(id: string, e: { datum: string; text: string; empfaengerId: string | null }): Promise<Erinnerung | undefined>;
  loescheErinnerung(id: string): Promise<void>;

  /* ---------- Notizen (#55) ---------- */
  notizen(mappeId: string): Promise<Notiz[]>;
  /** Notizen mehrerer Mappen (#367), je Mappe älteste zuerst. */
  notizenVon(mappeIds: string[]): Promise<Notiz[]>;
  holeNotiz(id: string): Promise<Notiz | undefined>;
  legeNotizAn(n: Notiz): Promise<Notiz>;
  aendereNotiz(id: string, text: string, von: string | null): Promise<Notiz>;
  loescheNotiz(id: string): Promise<void>;

  /* ---------- Änderungshistorie (#57) ---------- */
  historieSchreibe(e: Array<{ mappeId: string; benutzerId: string | null; art: Historienart; daten?: Historieneintrag['daten'] }>): Promise<void>;
  historie(mappeId: string): Promise<Historieneintrag[]>;
  /** Historie mehrerer Mappen (#367), je Mappe neueste zuerst. */
  historieVon(mappeIds: string[]): Promise<Historieneintrag[]>;
  /** Löscht die Historie von Mappen, die vor diesem Zeitpunkt endgültig gelöscht wurden. */
  historieAufraeumen(vor: string): Promise<number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/** Nummern ziehen beim Anlegen (#171): Feld → Kreis, Tag des Ziehens. */
export interface NummernZiehen { felder: Array<{ feldKey: string; kreis: string }>; jetzt: Date }

/** Neue Version eines Dokuments (#194). */
export interface NeueVersion {
  name: string; mime: string; groesse: number; sha256: string; anzeigbar: boolean; erstelltVon: string | null; herkunft: Herkunft;
  /** Volltext übernehmen (Zurückholen); undefined = Texterkennung neu. */
  volltext?: string | null;
}
