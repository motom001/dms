/** Schnittstelle (#1234): Mappen: laden, speichern, Notizen, Erkennung beim Zuordnen, Startseite, Archivnummern, Übersetzen, Papierkorb. */
import type { TextGesetzt, VorlagenListe } from '../../../shared/src/textsatz';
import type { AktionenAnMappe, AktionsSchritt } from '../../../shared/src/paketaktionen';
import type { StempelWunsch } from '../../../shared/src/stempel';
import type { Stufe as KleinStufe } from '../../../shared/src/verkleinern';
import type { LeerseitenWahl } from '../../../shared/src/leerseiten';
import type { Uebersetzt, Uebersetzungsquelle } from '../../../shared/src/uebersetzung';
import type { Verweiskonflikt, Aufgabe, Ausschnitt, Dokument, Historieneintrag, Notiz, Mappe, MappenBezug, Sortierung, Wert, Werte } from '../../../shared/src/model';
import type { Sichtbarkeit } from '../../../shared/src/sichtbarkeit';
import type { Rechte } from '../../../shared/src/rechte';
import type { AblaufAntworten, MappenAblauf, VorlageZumAnwenden } from '../../../shared/src/ablaufvorlagen';
import type { Baum } from '../../../shared/src/baum';
import type { LoeschAktion, LoeschPlan, LoeschVorschau } from '../../../shared/src/loeschbaum';
import type { LoeschAnlass } from '../../../shared/src/loeschprotokoll';
import type { Abgleich, Sicherheit, TypFund } from '../../../shared/src/erkennung';
import type { Klassifizierung } from '../../../shared/src/klassifizierung';
import { anfrage, sendeDatei, speichereDatei, stilleAnfrage } from './anfrage';

/** Vorschläge beim Zuordnen (#336), wie GET /api/mappen/:id/erkennung sie liefert. */
export interface ErkFund<T = string> { wert: T; sicherheit: Sicherheit; fundstelle: string }
export interface PostErkennung {
  zeit: string; dokumente: number;
  absender: Array<{ mappeId: string; typId: string; titel: string; stark: boolean; punkte: number; gruende: string[] }>;
  eindeutig: string | null;
  /** gutschrift (#1043): „Gutschrift“, „Erstattung“ … auf dem Beleg. */
  angaben: { datum: ErkFund | null; betrag: ErkFund<{ betrag: number; waehrung: string }> | null; nummern: Array<ErkFund & { label: string }>; gutschrift?: ErkFund };
  neuerAbsender: { typId: string; werte: Record<string, string>; fundstelle: string } | null;
  ziele: Array<{ mappeId: string; typId: string; titel: string; punkte: number; gruende: string[] }>;
  bezuege: Bezuege;
  /** Automatisch zugeordnet (#337). */
  auto?: { ziel: string; zeit: string; grund: string; rueckgaengig: boolean } | null;
  /** Ausgehend? (#1043): Aussteller ist eine eigene Organisation bzw. Person des Haushalts – nur ein Hinweis. */
  ausgehend?: { titel: string; fundstelle: string } | null;
}
/** Grund fürs Löschprotokoll (#470) als Body-Teil bzw. Query. */
const grundAus = (a?: LoeschAnlass) => (a?.grund ? { grund: a.grund, grundText: a.text ?? '' } : {});
export const anlassQuery = (a?: LoeschAnlass) => (a?.grund ? `?${new URLSearchParams({ grund: a.grund, ...(a.text ? { grundText: a.text } : {}) })}` : '');
export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string; /** Nicht lesbar (#126): ohne Link. */ verborgen?: boolean }
export type Bezuege = Record<string, MappenBezug>;
export interface Seite { gesamt: number; von: number; mappen: Mappe[]; bezuege: Bezuege; ausschnitte?: Record<string, Ausschnitt>; aufgaben?: Record<string, string>; /** Favoriten des Benutzers unter den Mappen dieser Seite (#62). */ favoriten?: string[]; /** Von anderen geändert seit dem letzten Sehen (#422). */ geaendert?: string[]; /** Favoriten ohne Benachrichtigung (#422, nur Favoritenliste). */ stumm?: string[]; /** Ähnliche Treffer (#442): nur in der Suche über alle Mappen mit Volltext. */ aehnlich?: AehnlicheMappe[]; /** Unscharfe Suche (#356): ohne genaue Treffer mit ähnlichen Schreibweisen gesucht. */ unscharf?: Unscharf }
/** Unscharfe Suche (#356): statt = gesuchter Text, vorschlag = „Meintest du …?“ (null, wenn nichts Besseres da ist). */
export interface Unscharf { statt: string; vorschlag: string | null; begriffe: Record<string, string[]> }
/** Eine Mappe mit einem ähnlichen Dokument (#442); aehnlichkeit = Kosinus (0 bis 1). */
export interface AehnlicheMappe { id: string; titel: string; typId: string; dokument: { id: string; name: string }; aehnlichkeit: number }
/** Eine Mappe im Papierkorb (#43). */
/** Einzelnes Dokument im Papierkorb (#344). mappe: da · papierkorb (erst die Mappe wiederherstellen) · weg. */
export interface DokumentImKorb {
  id: string; art: 'dokument'; mappeId: string; typId: string; mappeTitel: string; registerKey: string; register: string;
  name: string; mime: string; groesse: number; versionen: number; geloescht: string; geloeschtVon: string | null; mappe: 'da' | 'papierkorb' | 'weg';
  /** Anlagen (#998): Hauptdokument, an dem es hing – kommt mit ihm zurück. */
  anlageZu?: string | null;
}
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null; dokumente: number;
  /** Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs. */
  vorgang?: string | null;
  entkoppelt?: Array<{ quelleId: string; feldKey: string }>;
  /** Aufgelöste Post (#936): die Mappe, die aus ihr wurde; `da` = es gibt sie noch. Wiederherstellen geht dann nicht. */
  aufgeloestIn?: { id: string; typId: string; titel: string; da: boolean };
}
export interface MappeDetails { /** #820: ohne Verwaltungsmodus nicht lesbar – steht in der Historie. */ nurImVerwaltungsmodus?: boolean; /** Wirksame Rechte an der Mappe (#126). */ rechte?: Rechte; mappe: Mappe; favorit?: boolean; /** Geplante Mappen-Abläufe (#1044; früher nur Erinnerungen, #131) – Bereich „Geplant“. */ erinnerungen?: MappenAblauf[]; /** Automatisierungsvorlagen fürs Menü „Mappe“ (#1044). */ ablaufvorlagen?: VorlageZumAnwenden[]; rueckverweise: Rueckverweis[]; loeschbar?: { ok: boolean; grund?: string; rueckverweise?: Rueckverweis[]; /** Teile (#1031), die beim Löschen mitgehen. */ teile?: number }; dokumente: Dokument[]; notizen: Notiz[]; aufgaben: Aufgabe[]; bezuege: Bezuege; /** Verweise, die nicht (mehr) zum Auswahlfilter oder zu einem Feld passen, das aus ihnen folgt (#172, #886). */ unpassend?: Record<string, string[]>; /** Dasselbe je Feld mit den eigenen Feldern (#887). */ konflikte?: Verweiskonflikt[]; /** Archivmodus (#212). */ aufbewahrenBis?: string | null; /** Die Frist läuft noch nicht (#1051): beginnt mit diesem Feld. */ fristBeginntMit?: string; /** Exportrecht (#294): darf als PDF exportiert werden. */ exportierbar?: boolean; /** Auskunft nach Art. 15 DSGVO möglich (#396, Administratoren). */ auskunft?: boolean; /** Hinweise von Paketen (#1034). */ hinweise?: import('../../../shared/src/berechnet').PaketHinweis[]; /** Vorgabe aus einem Paket (#1038). */ vorgabe?: import('../../../shared/src/vorgaben').VorgabeHerkunft; /** Geschützte Felder (#995), die diese Person nicht ändern darf. */ schreibschutz?: string[] }
export interface Hochgeladen { dokument: Dokument; gleicherInhalt: Array<{ mappeId: string; name: string; titel?: string; typId?: string }> }
/** Eine Mappe unter „Zuletzt geöffnet“ (#334, #940); `am` fehlt bei Einträgen von früher (nur die Id gemerkt). */
export interface ZuletztGeoeffnet { id: string; typId: string; titel: string; am: string | null }

/** Weitere Angaben zu einer Seite der Liste (#1234: ein Objekt statt sechs Parametern). `gesamt`: Zahl vom ersten Blatt (#740). */
export interface SeitenWahl { sortierung?: Sortierung | null; volltext?: boolean; notizen?: boolean; link?: string; eigene?: Werte; gesamt?: number }

export const mappenApi = {
  /** Sichtbarkeit verwiesener Mappen (#888): je Id sichtbar, verborgen oder gelöscht – ohne Titel. */
  sichtbarkeit: (ids: string[]) => anfrage<Record<string, Sichtbarkeit>>('POST', '/api/mappen/sichtbarkeit', { ids }),
  /** Eine Seite einer Sicht („eingang“, Sicht- oder Typ-Id; „link“ mit den Parametern eines sprechenden Links, #98). */
  seite: (sicht: string, von = 0, anzahl = 100, suche = '', { sortierung, volltext = false, notizen = false, link, eigene, gesamt }: SeitenWahl = {}) =>
    anfrage<Seite>('GET', `/api/mappen?${new URLSearchParams({
      sicht, ...(link !== undefined ? { link } : {}), ...(eigene ? { eigene: JSON.stringify(eigene) } : {}), von: String(von), anzahl: String(anzahl), ...(suche ? { suche } : {}), ...(suche && volltext ? { volltext: 'true' } : {}), ...(suche && notizen ? { notizen: 'true' } : {}),
      // Beim Blättern (#740): die Zahl vom ersten Blatt – der Server zählt dann nicht noch einmal.
      ...(gesamt !== undefined && von > 0 ? { gesamt: String(gesamt) } : {}),
      ...(sortierung ? { sortierung: sortierung.spalte, absteigend: String(sortierung.absteigend) } : {}),
    })}`),
  /** Zeilen einer Tabelle an einer Mappe (#1030): je 50, nur lesbare Mappen; sortiert wie die Trefferliste des anderen Typs. */
  tabelle: (mappeId: string, feld: string, von = 0, sortierung?: Sortierung | null, gesamt?: number) =>
    anfrage<{ typId: string; spalten: string[]; gesamt: number; von: number; mappen: Mappe[]; bezuege: Bezuege }>('GET', `/api/mappen/${mappeId}/tabelle/${encodeURIComponent(feld)}?${new URLSearchParams({
      von: String(von), ...(gesamt !== undefined && von > 0 ? { gesamt: String(gesamt) } : {}),
      ...(sortierung ? { sortierung: sortierung.spalte, absteigend: String(sortierung.absteigend) } : {}),
    })}`),
  /** Alle Treffer einer Sicht als Ids (#149) – mit derselben Suche wie die Liste. */
  auswahl: (sicht: string, suche = '', volltext = false, notizen = false, link?: string) =>
    anfrage<{ ids: string[]; gesamt: number }>('GET', `/api/mappen/auswahl?${new URLSearchParams({
      sicht, ...(link !== undefined ? { link } : {}), ...(suche ? { suche } : {}), ...(suche && volltext ? { volltext: 'true' } : {}), ...(suche && notizen ? { notizen: 'true' } : {}),
    })}`),
  /** Mehrere Mappen löschen (#150); probe = nur zählen. */
  mappenLoeschen: (ids: string[], probe = false, anlass?: LoeschAnlass) =>
    anfrage<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }>('POST', '/api/mappen/loeschen', { ids, probe, ...grundAus(anlass) }),
  /** Stand der Ablage (#919): ein Fingerabdruck ohne Inhalt; ändert er sich, lädt die Oberfläche Zahlen und Startseite neu. */
  ablageStand: () => stilleAnfrage<{ stand: string }>('/api/ablage/stand').then((x) => x.stand),
  mappe: (id: string) => anfrage<MappeDetails>('GET', `/api/mappen/${id}`),
  /* Berechtigungen (#123–#127) */
  rechteVorschau: (id: string, werte: unknown) => anfrage<Rechte>('POST', `/api/mappen/${id}/rechte-vorschau`, { werte }),
  /** Verweisende Mappen eines Typs über ein Feld, vollständig (Tabelle im Verknüpfungsregister, #75). */
  verweisende: (id: string, typ: string, feld: string) => anfrage<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege }>('GET', `/api/mappen/${id}/verweisende?${new URLSearchParams({ typ, feld })}`),
  favorit: (id: string, an: boolean) => anfrage<null>(an ? 'PUT' : 'DELETE', `/api/mappen/${id}/favorit`),
  favoritBenachrichtigen: (id: string, an: boolean) => anfrage<{ benachrichtigen: boolean }>('PUT', `/api/mappen/${id}/favorit/benachrichtigen`, { an }),
  mappeAnlegen: (m: unknown) => anfrage<Mappe & { hinweis?: string }>('POST', '/api/mappen', m),
  mappeAendern: (id: string, m: unknown) => anfrage<Mappe & { hinweis?: string }>('PUT', `/api/mappen/${id}`, m),
  mappeLoeschen: (id: string, anlass?: LoeschAnlass) => anfrage<null>('DELETE', `/api/mappen/${id}${anlassQuery(anlass)}`),
  /** Mit allen verknüpften Mappen löschen (#424). */
  loeschVorschau: (id: string, tiefe: number) => anfrage<LoeschVorschau>('GET', `/api/mappen/${id}/loeschvorschau?tiefe=${tiefe}`),
  mitVerknuepftenLoeschen: (id: string, e: { tiefe: number; auswahl: Record<string, LoeschAktion>; grund?: string; grundText?: string }) =>
    anfrage<{ vorgang: string; endgueltig: boolean; zahlen: LoeschPlan['zahlen']; loeschen: string[]; erinnerung: { id: string; datum: string; text: string } | null }>('POST', `/api/mappen/${id}/mit-verknuepften-loeschen`, e),
  vorgangWiederherstellen: (vorgang: string, werkbank = false) =>
    anfrage<{ mappen: number; verweiseWieder: number; verweiseEntfallen: number; startId: string | null }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/vorgang/${vorgang}/wiederherstellen`),
  /* Papierkorb (#43): Ablage = eigener, Werkbank = alle */
  papierkorb: () => anfrage<PapierkorbEintrag[]>('GET', '/api/papierkorb'),
  papierkorbWerkbank: () => anfrage<{ tage: number; historieTage: number; eintraege: PapierkorbEintrag[]; dokumente?: DokumentImKorb[] }>('GET', '/api/werkbank/papierkorb'),
  /** Einzelne Dokumente im Papierkorb (#344). */
  papierkorbDokumente: () => anfrage<DokumentImKorb[]>('GET', '/api/papierkorb/dokumente'),
  dokumentWiederherstellen: (id: string, werkbank = false) => anfrage<{ dokument: Dokument; typId: string }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/dokumente/${id}/wiederherstellen`),
  dokumentEndgueltig: (id: string, werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/dokumente/${id}`),
  papierkorbEintrag: (id: string, werkbank = false) => anfrage<PapierkorbEintrag>('GET', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  wiederherstellen: (id: string, werkbank = false) => anfrage<{ mappe: Mappe; verweiseEntfallen: number; hinweis?: string }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}/wiederherstellen`),
  endgueltigLoeschen: (id: string, werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  papierkorbLeeren: (werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb`),
  /** Post auflösen (#936): `aufloesen` bei einer eben aus der Post angelegten Mappe; `hinweis`, wenn es beim Zuordnen blieb. */
  zuordnen: (postId: string, e: { ziel: string; register?: string; dokumente?: string[]; kopieren?: boolean; aufloesen?: boolean; leerseiten?: LeerseitenWahl; originalEmail?: boolean }) =>
    anfrage<{ post: Mappe; ziel: Mappe; aufgeloest: boolean; papierkorb?: boolean; abgetrennt?: Mappe; hinweis?: string; /** Leerseiten (#997): so viele Seiten sind weggelassen. */ leerseiten?: number }>('POST', `/api/mappen/${postId}/zuordnen`, e),
  /** „Dokument übernehmen“ (#934): Abgleich mit vorhandenen Mappen, Folgedokumente abtrennen, Wörter mit Lage. */
  abgleich: (e: { dokumente: string[]; typ?: string }) => anfrage<Abgleich & { bezuege: Bezuege; ohneText: string[]; typ?: TypFund | null }>('POST', '/api/abgleich', e),
  /** „Wohin gehört das?“ mehrstufig (#939): Pakete, Kern-Erkennung und Abgleich – ein Vorschlag mit Belegen. */
  klassifizieren: (e: { dokumente: string[] }) => anfrage<Klassifizierung & { bezuege: Bezuege }>('POST', '/api/klassifizieren', e),
  postAbtrennen: (postId: string, dokumente: string[]) => anfrage<{ post: Mappe; neu: Mappe }>('POST', `/api/mappen/${postId}/abtrennen`, { dokumente }),
  /** Erkennung (#336): Vorschläge beim Zuordnen; neu = jetzt neu rechnen. */
  erkennung: (postId: string, neu = false) => anfrage<PostErkennung>(neu ? 'POST' : 'GET', `/api/mappen/${postId}/erkennung`),
  // Text setzen (#1040): Vorlagen einer Mappe, Brief ablegen oder herunterladen.
  vorlagenFuer: (mappeId: string) => anfrage<VorlagenListe>('GET', `/api/mappen/${mappeId}/vorlagen`),
  /** `lauf`: Paket-Aktion mit dem Kern-Dialog (#1039) – nur Vorlagen dieses Pakets, Historie nennt das Paket. */
  textSetzen: (mappeId: string, dokumentId: string, register: string, lauf?: string) => anfrage<TextGesetzt>('POST', `/api/mappen/${mappeId}/vorlagen/${dokumentId}/setzen`, { ziel: 'ablegen', register, ...(lauf ? { lauf } : {}) }),
  textHerunterladen: (mappeId: string, dokumentId: string, name: string, lauf?: string) => speichereDatei(`/api/mappen/${mappeId}/vorlagen/${dokumentId}/setzen`, { ziel: 'herunterladen', ...(lauf ? { lauf } : {}) }, name),
  // Paket-Aktionen im Menü „Mappe“ (#1039): Angebot, Start, nächster Schritt, Abbrechen, Datei abholen; Schalter der Werkbank.
  paketAktionen: (mappeId: string) => anfrage<AktionenAnMappe>('GET', `/api/mappen/${mappeId}/paketaktionen`),
  paketAktionStarten: (mappeId: string, paket: string, aktion: string) => anfrage<AktionsSchritt>('POST', `/api/mappen/${mappeId}/paketaktionen/${encodeURIComponent(paket)}/${encodeURIComponent(aktion)}`),
  emailMehrere: (e: { ids: string[]; an: string; betreff: string; nachricht: string; angaben: boolean; dokumente: 'alle' | string[]; mitAnlagen?: boolean; originalEmail?: boolean; stempel?: StempelWunsch | null; verkleinern?: KleinStufe | null; fassung?: 'archiv' | 'original' }) =>
    anfrage<{ id: string; typId: string; mappen: number; anhaenge: number }>('POST', '/api/mappen/email', e),
  emailSenden: (mappeId: string, e: { an: string; betreff: string; nachricht: string; dokumente: string[]; mitAnlagen?: boolean; originalEmail?: boolean; stempel?: StempelWunsch | null; verkleinern?: KleinStufe | null; fassung?: 'archiv' | 'original' }) => anfrage<{ id: string; typId: string }>('POST', `/api/mappen/${mappeId}/email`, e),
  papierkorbTage: (e: { tage?: number; historieTage?: number }) => anfrage<{ tage: number; geleert: number; historieTage: number }>('PUT', '/api/werkbank/papierkorb/einstellungen', e),
  /* Fristen und Erinnerungen (#129–#132) */
  /** Startseite (#334): zuletzt geöffnete Mappen und ob es schon eigene Mappen gibt. */
  startseite: () => anfrage<{ zuletzt: ZuletztGeoeffnet[]; leer: boolean }>('GET', '/api/startseite'),
  /** „Zuletzt geöffnet“ als Liste (#940): die letzten 25 lesbaren Mappen, neueste oben. */
  zuletztGeoeffnet: () => anfrage<ZuletztGeoeffnet[]>('GET', '/api/startseite/zuletzt'),
  /** Automatisierungsvorlage an einer Mappe anwenden (#1044): „Aufgabe vergeben“, „Erinnern“, Wiedervorlage … */
  ablaufAnwenden: (mappeId: string, vorlage: string, e: AblaufAntworten) => anfrage<{ aufgaben: Aufgabe[]; ablauf: MappenAblauf | null; hinweis?: string }>('POST', `/api/mappen/${mappeId}/ablaeufe`, { ...e, vorlage }),
  /** Vor dem Zuweisen (#798): Darf dieser Benutzer die Mappe lesen? */
  darfLesen: (mappeId: string, benutzerId: string) => anfrage<{ lesen: boolean }>('GET', `/api/mappen/${mappeId}/leserecht/${benutzerId}`),
  notizAnlegen: (mappeId: string, text: string) => anfrage<Notiz>('POST', `/api/mappen/${mappeId}/notizen`, { text }),
  notizAendern: (id: string, text: string) => anfrage<Notiz>('PUT', `/api/notizen/${id}`, { text }),
  /** Übersetzung anzeigen (#732): ein Abschnitt; den Text liest der Server selbst. */
  uebersetzung: (quelle: Uebersetzungsquelle, teil: number) => anfrage<Uebersetzt>('POST', '/api/uebersetzung', { quelle, teil }),
  notizLoeschen: (id: string) => anfrage<null>('DELETE', `/api/notizen/${id}`),
  /** #800: `register` – nur, was dieses Register „Historie“ zeigt; `max`/`vor` – seitenweise. */
  historie: (mappeId: string, o: { register?: string; max?: number; vor?: number } = {}) => {
    const q = new URLSearchParams();
    if (o.register) q.set('register', o.register);
    if (o.max) q.set('max', String(o.max));
    if (o.vor !== undefined) q.set('vor', String(o.vor));
    const qs = q.toString();
    return anfrage<Historieneintrag[]>('GET', `/api/mappen/${mappeId}/historie${qs ? `?${qs}` : ''}`);
  },
  /** Passwortfeld anzeigen (#46); steht im Protokoll. */
  passwortAnzeigen: (mappeId: string, feld: string) => anfrage<{ wert: string }>('POST', `/api/mappen/${mappeId}/passwoerter/${encodeURIComponent(feld)}`),
  /** Auswahlfilter (#172, #173): welche gewählten Mappen passen zu den aktuellen Werten nicht? */
  auswahlPruefen: (typId: string, feldKey: string, ids: string[], werte: Werte) => anfrage<{ unpassend: string[]; gruende: Record<string, string[]> }>('POST', '/api/mappen/auswahl-pruefen', { typId, feldKey, ids, werte }),
  /** Folgt aus (#886): was aus den Quellen in `werte` folgt – je Feld die Mappe oder null. */
  /** Beim Auswählen übernehmen (#1037): Werte der Mappe `id` für die Felder, die das Verweisfeld `feldKey` vorbelegt. */
  vorbelegen: (typId: string, feldKey: string, id: string) => anfrage<{ felder: Record<string, Wert>; titel: string; typId: string; bezuege: Bezuege }>('POST', '/api/mappen/vorbelegen', { typId, feldKey, id }),
  folgen: (typId: string, werte: Werte) => anfrage<{ felder: Record<string, { quelle: string; wert: string | null; titel?: string; typId?: string }> }>('POST', '/api/mappen/folgen', { typId, werte }),
  aehnlicheZurMappe: (id: string) => anfrage<{ verfuegbar: boolean; berechnet: boolean; mappen: AehnlicheMappe[] }>('GET', `/api/mappen/${id}/aehnliche`),
  /** Baum über Verweise (#396, #424). */
  baum: (id: string, o: { tiefe?: number; richtungen?: string[]; max?: number; seitwaerts?: boolean } = {}) =>
    anfrage<Baum>('GET', `/api/mappen/${id}/baum?${new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]))}`),
  /** Archivnummer (#345). */
  archivnummer: (nr: string) => anfrage<{ dokument: Dokument; mappeId: string; typId: string; titel: string }>('GET', `/api/archivnummern/${encodeURIComponent(nr)}`),
  fotosAnMappe: (mappeId: string, e: { stapel: string[]; dokument?: string }) => anfrage<{ dokument: Dokument; seiten: number }>('POST', `/api/mappen/${mappeId}/fotos`, e),
  async ladeHoch(mappeId: string, register: string, datei: File, gleicherName?: 'zaehler' | 'version' | 'ersetzen'): Promise<Hochgeladen> {
    const q = new URLSearchParams({ register, name: datei.name, typ: datei.type || 'application/octet-stream', ...(gleicherName ? { gleicherName } : {}) });
    return sendeDatei(`/api/mappen/${mappeId}/dokumente?${q}`, datei) as Promise<Hochgeladen>;
  },
};
