/** Schnittstelle des Repos (#1278 aus repo/index.ts): Pakete, ihre Ereignisse, Ereigniskatalog, Abläufe und Hinweise. */
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import type { SprachpaketDaten, PaketEreignis, NeuesKatalogEreignis, GespeichertesKatalogEreignis } from './typen';
import type { VerlaufNeu, VerlaufEintrag, Auslastung } from '../../../../shared/src/paketreiter';
import type { MappenAblauf, AblaufAngehalten, Ablaufvorlage, AblaufVerlauf } from '../../../../shared/src/ablaufvorlagen';
import type { PaketHinweis } from '../../../../shared/src/berechnet';

/** Pakete (#188) mit Code, Sprachtexten, Ereignissen und Verlauf; Ereigniskatalog (#670); Mappen-Abläufe und Vorlagen (#1044); Hinweise von Paketen (#1034). */
export interface RepoPakete {
  /* ---------- Pakete (#188) ---------- */
  listePakete(): Promise<InstalliertesPaket[]>;
  /** Anlegen oder ersetzen (gleiche Id). */
  speicherePaket(p: InstalliertesPaket): Promise<void>;
  loeschePaket(id: string): Promise<void>;
  /**
   * Umzug auf eine neue Paket-Id (#1084, Manifest `ersetzt`, z. B. texterkennung_fra → texterkennung.fra): dieselbe
   * Installation unter neuer Id – Eintrag, Abhängigkeiten anderer Pakete, Code, Sprachtexte, Ereignisse, Wortlisten,
   * Herkunft der Mappentypen, Vektoren, mitgelieferte Automatisierungen und Dienstkonto (PostgreSQL in einer
   * Transaktion). Einstellungen zieht die Paketverwaltung über die Einstellungen um.
   */
  benennePaketUm(alt: string, neu: string): Promise<void>;
  /** Code eines Pakets (#338): code/modul.wasm und code/daten/…; ersetzt den bisherigen ganz. */
  speicherePaketCode(paketId: string, dateien: Array<{ name: string; inhalt: Buffer }>): Promise<void>;
  paketCode(paketId: string): Promise<Array<{ name: string; inhalt: Buffer }>>;
  loeschePaketCode(paketId: string): Promise<void>;
  /** Sprachpakete (#731): Texte und Beschriftungen je Paket; ersetzt die bisherigen ganz. */
  speichereSprachpaket(paketId: string, d: SprachpaketDaten): Promise<void>;
  sprachpakete(): Promise<Array<SprachpaketDaten & { paketId: string }>>;
  loescheSprachpaket(paketId: string): Promise<void>;
  /** Ereignisse für Pakete (#338): Ausgangskorb mit Wiederholung. */
  legeEreignisseAn(e: Array<{ id: string; paketId: string; art: string; daten: Record<string, unknown> }>): Promise<void>;
  /** Fällige, noch nicht zugestellte Ereignisse, älteste zuerst. */
  faelligeEreignisse(anzahl: number): Promise<PaketEreignis[]>;
  ereignisZugestellt(id: string): Promise<void>;
  /** Daten eines Ereignisses ersetzen (#458, Fortsetzung „weiter“): eine spätere Wiederholung setzt dort an. */
  ereignisDaten(id: string, daten: Record<string, unknown>): Promise<void>;
  /** Fehlschlag merken; naechster null = aufgeben. */
  ereignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null): Promise<void>;
  /** Je Paket: offen, aufgegeben, zugestellt und wann zuletzt (#670). */
  ereignisStand(): Promise<Record<string, { offen: number; aufgegeben: number; zugestellt: number; zuletzt?: string | null }>>;
  /** Alle Ereignisse eines entfernten Pakets verwerfen. */
  loescheEreignisse(paketId: string): Promise<void>;
  /** Verlauf eines Pakets (#1003): Einträge schreiben (räumt nebenbei auf: 30 Tage, höchstens 5000 je Paket). */
  notiereVerlauf(liste: VerlaufNeu[]): Promise<void>;
  /** Verlauf eines Pakets, neueste zuerst; vor: nur Einträge vor dieser Nummer (Blättern). */
  paketVerlauf(paketId: string, f: { vor?: number | null; anzahl: number; nurFehler?: boolean; suche?: string }): Promise<VerlaufEintrag[]>;
  /** Auslastung je Tag der letzten `tage` Tage und der letzte Aufruf. */
  paketAuslastung(paketId: string, tage: number): Promise<Auslastung>;
  /** Verlauf eines entfernten Pakets verwerfen. */
  loescheVerlauf(paketId: string): Promise<void>;
  /** Noch nicht zugestellte Ereignisse einer Art zu diesen Dokumenten verwerfen (#458, Texterkennung abbrechen); liefert die Anzahl. */
  loescheOffeneEreignisse(art: string, dokumente: string[]): Promise<number>;
  /* ---------- Ereigniskatalog (#670) ---------- */
  /**
   * Ereignis in den Ausgangskorb (in der Transaktion der Änderung). Mit `buendel`: Gibt es dazu noch ein offenes,
   * nicht geholtes Ereignis, dessen Frist (`buendelS`) noch läuft, bekommt es die mit `mische` zusammengeführten Daten
   * statt eines neuen Eintrags; liefert die Id des Ereignisses, das es aufnimmt.
   */
  legeKatalogEreignisAn(e: NeuesKatalogEreignis, mische?: (alt: Record<string, unknown>) => Record<string, unknown>): Promise<string>;
  /** Fällige Ereignisse holen und für `sperreS` Sekunden für diesen Server sperren (mehrere Server); älteste zuerst. */
  holeKatalogEreignisse(anzahl: number, sperreS: number): Promise<GespeichertesKatalogEreignis[]>;
  /** Diese Ereignisse sind an alle Abnehmer verteilt (#743: gesammelt in einer Anweisung). */
  katalogEreignisseVerteilt(ids: string[]): Promise<void>;
  /** Fehlschlag merken; naechster null = aufgeben (gilt als verteilt, Fehler bleibt stehen). */
  katalogEreignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null): Promise<void>;
  /** Verteiltes nach `tage` Tagen löschen, alte Fristmeldungen nach einem Jahr. */
  raeumeKatalogEreignisseAuf(tage: number): Promise<number>;
  /** Stand des Ausgangskorbs (Werkbank, Tests). */
  katalogEreignisStand(): Promise<{ offen: number; aufgegeben: number; verteilt: number; aeltestesOffen: string | null }>;
  /** „Frist erreicht“ (#670) je Mappe, Feld, Datum und Zeitpunkt genau einmal: true, wenn diese Meldung neu ist. */
  merkeFristMeldung(f: { mappeId: string; feld: string; datum: string; zeitpunkt: 'vorlauf' | 'faellig' }): Promise<boolean>;

  /* ---------- Mappen-Abläufe (#1044; früher freie Erinnerungen, #131), solange sie nicht gelaufen sind ---------- */
  /** `empfaengerId`: Antwort auf „Empfänger“; `personId`: wer ihn angelegt hat; `bis`: läuft bis dahin. */
  ablaeufe(f?: {
    mappeId?: string;
    empfaengerId?: string;
    personId?: string;
    vorlage?: string;
    bis?: string;
    angehalten?: boolean;
  }): Promise<MappenAblauf[]>;
  holeAblauf(id: string): Promise<MappenAblauf | undefined>;
  legeAblaufAn(e: MappenAblauf): Promise<MappenAblauf>;
  aendereAblauf(id: string, e: { datum: string; text: string; empfaengerId: string | null }): Promise<MappenAblauf | undefined>;
  setzeAblaufAngehalten(id: string, a: AblaufAngehalten | null): Promise<void>;
  /** Löscht ihn; true nur für den, der ihn gelöscht hat (mehrere Server: genau einer lässt ihn laufen). */
  loescheAblauf(id: string): Promise<boolean>;

  /* ---------- Automatisierungsvorlagen (#1044): gespeicherte Vorlagen, Verlauf der Abläufe ---------- */
  ablaufvorlagen(): Promise<Ablaufvorlage[]>;
  /**
   * Neu (`erwartet` null; false, wenn es die Kennung schon gibt) oder geändert (nur mit passender `version`). Die Fassungen
   * (#1006) hält die Repo-Hülle fest (`fassungen/huelle.ts`), nicht das Repo.
   */
  speichereAblaufvorlage(v: Ablaufvorlage, von: string | null, erwartet: number | null): Promise<boolean>;
  loescheAblaufvorlage(kennung: string): Promise<void>;
  vermerkeAblauf(e: AblaufVerlauf): Promise<void>;
  ablaufVerlauf(f: { vorlage?: string; mappeId?: string; anzahl: number }): Promise<AblaufVerlauf[]>;
  /** Bremse (#1044): Einträge einer Person seit `seit` mit diesen Arten. */
  zaehleAblaufVerlauf(personId: string, seit: string, arten: AblaufVerlauf['art'][]): Promise<number>;
  raeumeAblaufVerlaufAuf(tage: number, jeVorlage: number): Promise<number>;

  /* ---------- Hinweise von Paketen (#1034) ---------- */
  /** Hinweise an einer Mappe (alle Pakete), älteste zuerst; `paketName` ergänzt der Dienst. */
  hinweise(mappeId: string): Promise<Array<Omit<PaketHinweis, 'paketName'>>>;
  /** Hinweis setzen oder ersetzen (je Mappe, Paket und Schlüssel einer). */
  setzeHinweis(h: { mappeId: string; paket: string; schluessel: string; text: string }): Promise<void>;
  /** Hinweis entfernen; true, wenn es ihn gab. */
  loescheHinweis(mappeId: string, paket: string, schluessel: string): Promise<boolean>;
  /** Alle Hinweise eines Pakets (beim Entfernen des Pakets). */
  loescheHinweiseVon(paket: string): Promise<number>;
}
