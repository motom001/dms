/** Paketverwaltung (#1278 aus pakete.ts): Pakete mit Code – Schnittstellen, Ereignisse, Rechte und Grenzen. */
import { t } from '../texte';
import type { PaketKatalogArt, VERALTETE_EREIGNISSE } from '../ereignisse';
import type { Hilfeort } from '../hilfe';
import type { PaketdatenBereich } from '../paketdaten';
import type { PaketKarte } from '../automatisierung';
/** Steht seit #1278 (Schritt 5) in kennungen.ts; hier weiter erreichbar. */
export { ALLE_TYPEN } from '../kennungen';

/* ---------- Pakete mit Code (#338) ---------- */

/** Volltext von einem Paket: so beginnt ocr.info; die eingebaute Texterkennung lässt ihn stehen. */
export const PAKET_TEXT = t('gemeinsam.pakete.texterkennung-durch-paket');
/** Volltext von einem Paket mit `dms:volltext` (#614): ausgelesen, nicht erkannt (Frage 49) – gilt intern ebenso als „vom Paket“. */
export const PAKET_VOLLTEXT = t('gemeinsam.pakete.volltext-durch-paket');
/** Stammt der Volltext (ocr.info) von einem Paket – erkannt oder ausgelesen? */
export const istPaketText = (info: string | null | undefined) => !!info && (info.startsWith(PAKET_TEXT) || info.startsWith(PAKET_VOLLTEXT));

/** Was ein Paket mit Dokumenten darf. */
export type DokumentRecht = 'keine' | 'lesen' | 'schreiben';
export const DOKUMENT_RECHTE: Record<DokumentRecht, string> = {
  keine: t('gemeinsam.pakete.keine-dokumente'),
  lesen: t('gemeinsam.pakete.dokumente-lesen'),
  schreiben: t('gemeinsam.pakete.dokumente-lesen-und-volltext'),
};
/**
 * Ereignisse, die ein Paket abonnieren kann (nicht blockierend, mit Wiederholung) – genau die des gemeinsamen
 * Ereigniskatalogs mit `paket: true` (shared/src/ereignisse.ts, #724) und die veralteten Namen im Übergang.
 */
export const EREIGNISSE = {
  'post.angelegt': t('gemeinsam.pakete.neue-post-ist-angelegt'),
  'dokument.hochgeladen': t('gemeinsam.pakete.ein-dokument-wurde-hochgeladen'),
  'texterkennung.fertig': t('gemeinsam.pakete.die-texterkennung-eines-dokuments'),
  'volltext.fertig': t('gemeinsam.pakete.der-volltext-eines-dokuments'),
  'paket.einstellungen_geaendert': t('gemeinsam.pakete.die-einstellungen-des-pakets'),
  'datei.umwandeln': t('gemeinsam.pakete.eine-datei-soll-umgewandelt'),
  'sicherung.fertig': t('gemeinsam.pakete.eine-sicherung-ist-fertig'),
  'datei.volltext': t('gemeinsam.pakete.eine-datei-braucht-ihren'),
  'datei.archivfassung': t('gemeinsam.pakete.ein-dokument-mit-fertigem'),
  // Mappen-Ereignisse aus dem Ereigniskatalog (#670, shared/src/ereignisse.ts): nur zu Typen unter code.mappentypen (#686: auch fremde).
  'mappe.angelegt': t('gemeinsam.pakete.eine-mappe-ist-angelegt'),
  'mappe.geaendert': t('gemeinsam.pakete.eine-mappe-ist-geaendert'),
  'mappe.geloescht': t('gemeinsam.pakete.eine-mappe-ist-geloescht'),
  'mappe.wiederhergestellt': t('gemeinsam.pakete.eine-mappe-ist-aus'),
  'frist.erreicht': t('gemeinsam.pakete.eine-frist-ist-erreicht'),
  // #1082: nur über eine Automatisierung mit der Karte „Paket nach Zeitplan ausführen“, die genau dieses Paket nennt.
  'zeitplan.ausgefuehrt': t('gemeinsam.pakete.zeitplan-ausgefuehrt'),
} as const satisfies Record<PaketKatalogArt | keyof typeof VERALTETE_EREIGNISSE, string>;
/** Ereignisse zu Mappen (#670): brauchen code.mappentypen, gelten nur für diese Typen (seit #686 auch fremde). */
export const MAPPEN_EREIGNISSE: readonly EreignisArt[] = [
  'mappe.angelegt',
  'mappe.geaendert',
  'mappe.geloescht',
  'mappe.wiederhergestellt',
  'frist.erreicht',
];
/** Ab dieser Version kennt das DMS Mappen-Ereignisse für Pakete (#670); ältere lehnen die Ereignisse beim Installieren ab. */
export const DMS_MAPPEN_EREIGNISSE_AB = '0.153.0';
/** Ab dieser Version (#686) nimmt das DMS fremde Mappentypen und „*“ in code.mappentypen an; ältere lehnen sie ab. */
export const DMS_FREMDE_MAPPENTYPEN_AB = '0.166.0';
export type EreignisArt = keyof typeof EREIGNISSE;
/**
 * Schnittstellen des Kerns, die ein Paket zusätzlich nutzen darf (`code.rechte.schnittstellen`, #442).
 * Der Kern rechnet dabei nichts selbst: Er speichert und vergleicht nur, was das Paket liefert.
 */
export const SCHNITTSTELLEN = {
  'dms:vektoren': t('gemeinsam.pakete.vektoren-zu-dokumenten-speichern'),
  'dms:antworten': t('gemeinsam.pakete.fragen-an-die-ablage'),
  'dms:erkennen': t('gemeinsam.pakete.felder-aus-dokumenten-vorschlagen'),
  'dms:texterkennung': t('gemeinsam.pakete.texterkennung-fuer-scans-und'),
  'dms:umwandeln': t('gemeinsam.pakete.dateien-umwandeln-die-ablago'),
  'dms:sicherung-lesen': t('gemeinsam.pakete.die-verschluesselte-sicherung-lesen'),
  'dms:sicherung-holen': t('gemeinsam.pakete.sicherung-holen'),
  'dms:volltext': t('gemeinsam.pakete.volltext-fuer-dateien-liefern'),
  'dms:archivfassung': t('gemeinsam.pakete.archivfassung-pdf-a-ablegen'),
  'dms:uebersetzen': t('gemeinsam.pakete.inhalte-uebersetzen'),
  'dms:klassifizieren': t('gemeinsam.pakete.mappentyp-vorschlagen'),
  'dms:hinweise': t('gemeinsam.pakete.hinweise-setzen'),
  'dms:leerseiten': t('gemeinsam.pakete.leerseiten-markieren'),
  'dms:anlagen': t('gemeinsam.pakete.anlagen-anlegen'),
  // Codes lesen (#1723): QR-Codes und Barcodes auf Dokumenten, Antwort wie dokument.lesen.barcode@1.
  'dms:codes': t('gemeinsam.pakete.codes-lesen'),
} as const;
export type Schnittstelle = keyof typeof SCHNITTSTELLEN;
/** Ab dieser Version kennt das DMS `code.rechte.schnittstellen` und das Ereignis `volltext.fertig` (#442). */
export const DMS_VEKTOREN_AB = '0.120.0';
/**
 * Ab dieser Version kennt das DMS die Schnittstelle `dms:antworten`, die Einstellung vom Typ `adresse`
 * (Dienst-Adresse, zu der allein das Paket ins Netz darf) und die Funktionen `netz_strom`, `netz_weiter`
 * und `teil` des Läufers (#444).
 */
export const DMS_ANTWORTEN_AB = '0.124.0';
/** Hilfe-Ort je Schnittstelle (Administratorhandbuch, Pakete mit Code). */
export const SCHNITTSTELLE_HILFE: Record<Schnittstelle, Hilfeort> = {
  'dms:vektoren': 'pakete.recht.vektoren',
  'dms:antworten': 'pakete.recht.antworten',
  'dms:erkennen': 'pakete.recht.erkennen',
  'dms:texterkennung': 'pakete.recht.texterkennung',
  'dms:umwandeln': 'pakete.recht.umwandeln',
  'dms:sicherung-lesen': 'pakete.recht.sicherung',
  'dms:sicherung-holen': 'pakete.recht.sicherung',
  'dms:volltext': 'pakete.recht.volltext',
  'dms:archivfassung': 'pakete.recht.archivfassung',
  'dms:uebersetzen': 'pakete.recht.uebersetzen',
  'dms:klassifizieren': 'pakete.recht.klassifizieren',
  'dms:hinweise': 'pakete.recht.hinweise',
  'dms:leerseiten': 'pakete.recht.leerseiten',
  'dms:anlagen': 'pakete.recht.anlagen',
  'dms:codes': 'pakete.recht.codes',
};
/**
 * Ab dieser Version (#585) kennt das DMS das Ereignis `sicherung.fertig` und die Schnittstelle `dms:sicherung-lesen`:
 * Ein Paket liest die verschlüsselte Sicherung in Stücken, kopiert sie außer Haus und meldet je Sicherung zurück.
 */
export const DMS_SICHERUNG_AB = '0.142.0';
/** Ab dieser Version kennt das DMS die Schnittstelle `dms:erkennen` (#511): Erkennung für „Aus Dokument ausfüllen“. */
export const DMS_ERKENNEN_AB = '0.125.0';
/**
 * Ab dieser Version kennt das DMS den Abschnitt `inhalt.wortlisten` (#356): Gruppen gleichbedeutender Wörter für die
 * Suche. Ältere Versionen übergehen ihn stillschweigend – Pakete damit geben `dms: ">=0.127.0"` an.
 */
export const DMS_WORTLISTEN_AB = '0.127.0';
/**
 * Ab dieser Version (#458) liest der Kern nur noch die Textebene von PDFs (poppler) und meldet jedes Dokument mit
 * `volltext.fertig` – auch ohne Text (`text: false`), mit `quelle`, `mime`, `seiten` und ggf. `neu`. Die
 * Schnittstelle `dms:texterkennung` gibt es ab hier. `texterkennung.fertig` bleibt als veralteter Gleichlaut.
 */
export const DMS_VOLLTEXT_AB = '0.133.0';
/** Höchstens so viele Gruppen gleichbedeutender Wörter je Paket (#356). */
export const WORTLISTEN_MAX = 1000;
/** Darf ein Paket mit Code ins Netz (feste Adressen oder Dienst-Adresse)? Dann verlassen Daten das DMS. */
export const hatNetz = (c: PaketCode | undefined) => !!c && (c.netz.length > 0 || (c.adressen?.length ?? 0) > 0);
/**
 * Schnittstellen, über die ein Paket Inhalte bekommt (#796): Ausschnitte, Text, Dateien. `dms:sicherung-lesen` fehlt
 * bewusst – die Sicherung ist verschlüsselt und enthält immer alles.
 */
/**
 * Ereignisse ohne Inhalt der Ablage (#796): Nur sie zählen nicht. Die Liste ist bewusst die Gegenliste – eine neue
 * Ereignisart gilt damit erst einmal als „mit Inhalt“ (Mappen-, Dokument-, Post-Ereignisse tragen Ids, Typen,
 * Dateinamen oder „Für“).
 */
export const EREIGNISSE_OHNE_INHALT: readonly EreignisArt[] = ['sicherung.fertig', 'paket.einstellungen_geaendert', 'zeitplan.ausgefuehrt'];
/** Ereignisse, mit denen ein Paket etwas aus der Ablage erfährt (#796): alle außer {@link EREIGNISSE_OHNE_INHALT}. */
export const INHALT_EREIGNISSE: readonly EreignisArt[] = (Object.keys(EREIGNISSE) as EreignisArt[]).filter(
  (e) => !EREIGNISSE_OHNE_INHALT.includes(e),
);
export const INHALT_SCHNITTSTELLEN: readonly Schnittstelle[] = [
  'dms:antworten',
  'dms:erkennen',
  'dms:klassifizieren',
  'dms:uebersetzen',
  'dms:vektoren',
  'dms:texterkennung',
  'dms:volltext',
  'dms:umwandeln',
  'dms:archivfassung',
  'dms:codes',
];
/**
 * KI-Paket bzw. „KI-Dienst“ (#796): ein Paket, das Inhalte lesen oder bekommen kann (Mappen, Dokumente, Volltext,
 * Ausschnitte) und ins Netz darf. Es bekommt nur Inhalte aus Mappentypen, die der Administrator für KI-Dienste
 * zugelassen hat – neue Mappentypen erst nach ausdrücklicher Zulassung. Pakete ohne Netz rechnen im Haus und
 * sind davon nicht betroffen. In der Oberfläche heißt das seit #1559 „Darf an Dienste im Netz gehen“ (Paket mit
 * Netz, das Inhalte bekommt); der Name hier bleibt, um keinen Umbau auszulösen.
 */
export const istKiPaket = (c: PaketCode | undefined): boolean =>
  !!c &&
  hatNetz(c) &&
  (c.rechte.lesen.length > 0 ||
    c.rechte.dokumente !== 'keine' ||
    (c.rechte.schnittstellen ?? []).some((s) => INHALT_SCHNITTSTELLEN.includes(s)) ||
    c.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e)) ||
    // Angebote beim Ausfüllen (#1724): Das Paket bekommt einen Code vom Dokument (z. B. Zugangsdaten) – das ist Inhalt.
    !!c.angebote?.length);

/** Werkbank (#796): Mappentypen mit „für KI-Dienste zugelassen“, KI-Pakete und welche Mappentypen jedes bekommt. */
export interface KiUebersicht {
  typen: Array<{ id: string; name: string; zugelassen: boolean; system?: string }>;
  pakete: Array<{ id: string; name: string; bekommt: string[] }>;
  /** #1635: bisherige Liste, noch nicht gefragt „alle erlauben?“ (einmal in der Übersicht, bei „Dienste im Netz“). */
  hinweis: boolean;
  /**
   * #1635: true = alle Bereiche gehen hinaus, außer den ausgenommenen (neue Mappentypen gehören dazu). false = die
   * bisherige Liste einer bestehenden Installation (nur die zugelassenen; neue Mappentypen erst nach Zulassung).
   */
  alle?: boolean;
}

/**
 * Arten von Dokumenten für die Archivfassung (#660): je ein Schlüssel einer Ja/Nein-Einstellung des Pakets. `emails`
 * (#946): `.eml` und Outlook `.msg` – siehe `mailTyp` in archivfassung.ts.
 */
export const ARCHIV_ARTEN = ['pdf_text', 'pdf_scan', 'bilder', 'emails'] as const;
export type ArchivArt = (typeof ARCHIV_ARTEN)[number];
export type ArchivAuswahl = Partial<Record<ArchivArt, string>>;

export interface PaketCode {
  sprache: string;
  ereignisse: EreignisArt[];
  /** Typverweise wie in Inhalten (eigene ohne Präfix, <paket>:<schluessel>, dms:<kennung>) oder „*“. */
  rechte: {
    lesen: string[];
    schreiben: string[];
    dokumente: DokumentRecht;
    schnittstellen?: Schnittstelle[];
    /**
     * Einrichtung bzw. Nachweise lesen (#1053, #1054): die Bereiche, die das Paket anfragt. Nur lesend; wirksam ist nur,
     * was der Administrator in den Paket-Einstellungen anhakt. Nie zusammen mit Netz (Ergänzung Sicherheit).
     */
    einrichtung?: PaketdatenBereich[];
    nachweise?: PaketdatenBereich[];
  };
  /** Erlaubte Adressen (https://host…); alles andere ist gesperrt. */
  netz: string[];
  /**
   * Einstellungen vom Typ „adresse“ (#444): Dorthin darf das Paket zusätzlich ins Netz – zu der Adresse, die der
   * Administrator einträgt und bestätigt. Steht hier, damit die Rückfrage bei der Installation sie nennt.
   */
  adressen?: Array<{ schluessel: string; name: string }>;
  /**
   * Dateitypen, die das Paket umwandelt (#577, `code.umwandeln`, nur mit `dms:umwandeln`): Dafür bekommt es das
   * Ereignis `datei.umwandeln` und darf eine Fassung (PDF, PNG, JPEG) und ein Vorschaubild zurückgeben.
   */
  umwandeln?: string[];
  /**
   * Dateitypen, für die das Paket den Volltext liefert (#614, `code.volltext`, nur mit `dms:volltext`): Dafür bekommt
   * es das Ereignis `datei.volltext` und darf den Volltext dieser Dokumente schreiben – sonst nichts an Dokumenten.
   */
  volltext?: string[];
  /**
   * Archivfassung (#631, `code.archivfassung`, nur mit `dms:archivfassung`): Dateitypen, zu denen das Paket ein PDF/A
   * ablegt (PDF, JPEG und PNG erlaubt), und optional je Art (#660: `pdf_text`, `pdf_scan`, `bilder`, #946: `emails`) der Schlüssel einer
   * Ja/Nein-Einstellung des Pakets: an = diese Dokumente bekommen eine Archivfassung (fehlt der Schlüssel: immer).
   */
  archivfassung?: { typen: string[]; auswahl?: ArchivAuswahl };
  /**
   * Mappentypen, zu denen das Paket Mappen-Ereignisse bekommt (#670, `code.mappentypen`): Schlüssel aus dem eigenen
   * `inhalt`, Verweise auf fremde Typen wie in `code.rechte` (#686, `paket:typ`, `dms:post`) oder `*` (alle, die das
   * Paket lesen darf). Nötig für mappe.* und frist.erreicht; das Paket muss sie lesen dürfen. Zugestellt wird nur, was
   * der Paket-Benutzer gerade lesen darf (Regeln für die Rolle „Paket“, „Pakete“ am Mappentyp).
   */
  mappentypen?: string[];
  /** Anzeigen, Prüffunktion der Einstellungen und Ausprobieren (#996, #1004) – gelesen in paketreiter.ts. */
  reiter?: import('../paketreiter').PaketReiterAngaben;
  /**
   * Eigene Dann-Karten (#680, `code.karten`): erscheinen im Kartenvorrat der Automatisierungen als „Paket: Name“.
   * Ausgeführt nur nach Zeitplan, als Ereignis `zeitplan.ausgefuehrt` mit `aufgabe` = Schlüssel der Karte und `werte`.
   */
  karten?: PaketKarte[];
  /** Angebote beim Ausfüllen (#1724, `code.angebote`): zu einem Code auf dem Dokument Daten holen – erst nach Klick. */
  angebote?: import('../angebote').AusfuellAngebot[];
  /** Das WebAssembly-Modul (code/modul.wasm) und Daten (code/daten/…), nur im installierten Paket. */
  modul?: { sha256: string; groesse: number };
  daten?: string[];
}

/**
 * Mappentypen des DMS, die `code.rechte` mit `dms:<kennung>` nennen darf (#435): Ablageort (Alias, #883), Rolle und Post.
 * `dms:benutzer` ist verboten (Pakete sehen keine Benutzer). Post gibt es hier – anders als bei Verweisen in
 * Inhalten –, damit ein Paket wie Trennblatt nur Post lesen und schreiben darf statt aller Typen („*“).
 */
export const DMS_RECHTE_TYPEN: Record<string, string> = { ablageort: 'Ablageort', rolle: 'Rolle', post: 'Post' };
/**
 * Veraltete Verweise (#883): Den Ablageort bringt seit Ablago 0.212 das Paket Basis mit. `dms:ablageort` gilt eine Zeit
 * lang weiter als Alias für `basis:ablageort` – in Inhalten wie in `code.rechte` – und zeigt auf den Ablageort von Basis
 * bzw. den früheren des Kerns. Die Paketprüfung gibt dazu einen Hinweis. Der Alias entfällt mit Ablago 1.0.0
 * (server/src/grundlagen/uebergaenge.ts, #902).
 */
export const DMS_ALIAS: Record<string, string> = { ablageort: 'basis:ablageort' };
/** Veraltete `dms:…`-Verweise aus einer Liste (je einmal), z. B. ["dms:ablageort"]. */
export const veralteteVerweise = (liste: Iterable<string>): string[] => [
  ...new Set([...liste].filter((v) => v.startsWith('dms:') && DMS_ALIAS[v.slice(4)])),
];
/** Ab dieser Version kennt das DMS `dms:post` in code.rechte (#435); ältere ignorieren die Kennung. */
export const DMS_POST_RECHT_AB = '0.94.0';

export const SPRACHEN = ['rust', 'go', 'c', 'assemblyscript', 'javascript'];

/**
 * Die eine Größengrenze für Pakete (#644): das Archiv beim Herunterladen, Hochladen, in der Sammeldatei und beim
 * Paket erstellen, ebenso alle Dateien unter code/ zusammen. dms-registry prüft dieselbe Zahl (pruefen.py,
 * katalog.py, sammeldatei.py). 128 MB, damit Modelle (z. B. Übersetzen, 17–44 MB je Sprachrichtung) passen.
 */
export const PAKET_MAX = 128 * 1024 * 1024;
/** Höchstens so groß sind alle Dateien unter code/ eines Pakets zusammen (#403) – dieselbe Grenze wie das Archiv (#644). */
export const CODE_MAX = PAKET_MAX;
/**
 * Beispiel-Dokumente (#878): Dateien unter inhalt/beispiele/, die ein Beispiel unter `dokumente` nennt. Erlaubt sind
 * PDF, PNG und JPEG (erkannt am Inhalt, passend zur Endung), je Datei höchstens so groß wie beim Hochladen; alle
 * zusammen zählen zur Paketgrenze (PAKET_MAX). dms-registry prüft dasselbe (pruefen.py).
 */
export const BEISPIEL_ORDNER = 'inhalt/beispiele/';
export const BEISPIEL_ENDUNGEN: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
/** Ab dieser Version legt Ablago Beispiel-Dokumente an (#878); ältere übergehen `dokumente` an Beispielen. */
export const BEISPIEL_DOKUMENTE_AB = '0.223.0';
/** Stand einer Beispiel-Mappe nach dem Anlegen (#878): Prüfwert der Feldwerte und Dokumente als „Id:sha256“. */
export interface BeispielStand {
  id: string;
  werte: string;
  dokumente: string[];
}

/** Größe in MB für Meldungen, gerundet auf eine Stelle mit Komma. */
export const inMB = (bytes: number): string => (Math.round(bytes / 104857.6) / 10).toString().replace('.', ',');

/**
 * Legt eine Neuinstallation sichtbar etwas an – Mappentypen, Ansichten oder Beispiele (#643)? Nur dann zeigt die
 * Vorschau „Das wird angelegt“; Pakete nur mit Code (z. B. Texterkennung) beschreiben stattdessen, was sie tun.
 */
export function legtEtwasAn(v: {
  typen: Array<{ vorhanden: boolean; geloescht?: boolean }>;
  sichten: Array<{ vorhanden: boolean }>;
  beispiele: number;
  vorgaben?: Array<{ zustand: string }>;
  ergaenzungen?: Array<{ fehlt?: boolean }>;
}): boolean {
  return (
    v.typen.some((t) => !t.vorhanden && !t.geloescht) ||
    v.sichten.some((s) => !s.vorhanden) ||
    v.beispiele > 0 ||
    // Vorgaben (#1038): neue Mappen und Vorlagen an Vorgaben anderer Pakete.
    !!v.vorgaben?.some((x) => x.zustand === 'neu') ||
    !!v.ergaenzungen?.some((x) => !x.fehlt)
  );
}
