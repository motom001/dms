/**
 * Größengrenzen an einer Stelle (#901).
 *
 * Jede Grenze in Bytes steht hier, mit Namen und kurzer Begründung. Außerhalb dieser Datei schreibt der Server keine
 * Byte-Zahlen mehr (`grenzen.test.ts` prüft das), sondern nimmt die Namen von hier oder die Einheiten `KB`, `MB`, `GB`.
 * Grenzen, die auch die Oberfläche kennt, stehen in `shared/` und werden hier nur aufgeführt.
 *
 * Die Tabelle „Grenzen“ im Admin-Handbuch (admin/docs/technik.md) gibt die Grenzen wieder, die man von außen bemerkt.
 */
import { MAX_DATEIGROESSE } from '../../shared/src/model';
import { ARCHIVFASSUNG_MAX_BYTES } from '../../shared/src/archivfassung';
import { FASSUNG_MAX_BYTES, UMWANDELN_MAX_BYTES, VORSCHAUBILD_MAX_BYTES } from '../../shared/src/dateiumwandlung';
import { CODE_MAX, PAKET_MAX } from '../../shared/src/pakete';
import { VOLLTEXT_KOERPER_MAX, VOLLTEXT_PAKET_MAX_BYTES } from '../../shared/src/paketvolltext';
import { AUTOMATISIERUNG_GRENZEN } from '../../shared/src/automatisierung';

/* ---------- Einheiten ---------- */

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

/* ---------- Aus shared (auch die Oberfläche prüft sie) ---------- */

export { ARCHIVFASSUNG_MAX_BYTES, CODE_MAX, FASSUNG_MAX_BYTES, MAX_DATEIGROESSE, PAKET_MAX, UMWANDELN_MAX_BYTES, VOLLTEXT_KOERPER_MAX, VOLLTEXT_PAKET_MAX_BYTES, VORSCHAUBILD_MAX_BYTES };

/* ---------- Körper von Anfragen ---------- */

/** Spielraum über der eigentlichen Datei für Routen mit rohem Körper (Fastify zählt den ganzen Körper). */
export const KOERPER_SPIELRAUM = KB;
/** JSON-Körper aller Routen ohne eigene Grenze. Dateien kommen nur über Routen mit `roh` (#901). */
export const JSON_KOERPER_MAX = 2 * MB;
/** Einrichtungs-Assistent vor dem ersten Konto: nur kleine Formulare. */
export const EINRICHTUNG_KOERPER_MAX = 64 * KB;
/** Start- und Lasttestmodus: nur Formulare und Statusabfragen. */
export const MODUS_KOERPER_MAX = 16 * KB;
/** Antwort eines Geräts beim Anlegen oder Anmelden mit Passkey (#811), als JSON gezählt – echte sind wenige KB. */
export const PASSKEY_ANTWORT_MAX = 16 * KB;
/** Offene Herausforderungen für die Anmeldung mit Passkey ohne E-Mail-Adresse je IPv4-Adresse bzw. IPv6-/64 in 5 Minuten. */
export const PASSKEY_OPTIONEN_JE_ADRESSE = 20;
/** Dieselben für alle Adressen zusammen – nur Notbremse gegen ein Fluten des Kurzzustands aus vielen Netzen. */
export const PASSKEY_OPTIONEN_GESAMT = 20_000;
/** Fehlermeldung mit Bildschirmfoto und Anhängen (Konto → Fehler melden). */
export const FEHLERMELDUNG_KOERPER_MAX = 30 * MB;
/** Bildschirmfoto einer Fehlermeldung, einzeln. */
export const FEHLER_BILD_BYTES = 10 * MB;
/** Datei für „Aus Dokument ausfüllen“ ohne Ablage (Vorschläge zu einem Mappentyp). */
export const VORSCHLAG_DATEI_MAX = 30 * MB;
/** Logo eines Designs. */
export const LOGO_MAX = MB;
/** Einrichtungsdatei (`ablago-einrichtung.json`). */
export const EINRICHTUNGSDATEI_MAX = 64 * KB;

/* ---------- Pakete ---------- */

/** Höchstens so groß ist ein Paket-Archiv – die gemeinsame Grenze aus shared (#644). */
export const ARCHIV_MAX = PAKET_MAX;
/** Entpackt höchstens – ohne code/; dafür gilt CODE_MAX (#403, geprüft in liesCode). */
export const ENTPACKT_MAX = 20 * MB;
/** Katalog, Signatur und Schlüssel: höchstens 10 MB (wie vor #644, #809). */
export const KLEIN_MAX = 10 * MB;
/** Signatur eines Katalogs. */
export const SIGNATUR_MAX = 8 * KB;
/** Sammeldatei: höchstens zwei Paket-Archive groß, entpackt alle Pakete zusammen höchstens vier. */
export const SAMMEL_MAX = 2 * PAKET_MAX;
export const SAMMEL_ENTPACKT_MAX = 4 * PAKET_MAX;
/** Verzeichnis `sammeldatei.json` in einer Sammeldatei. */
export const SAMMEL_VERZEICHNIS_MAX = MB;
/**
 * Hochgeladene, noch nicht installierte Pakete im Arbeitsspeicher, zusammen höchstens (#901, gemessen an den Archiven).
 * Darüber fällt das älteste heraus; bei mehreren Prozessen liegt es weiter im Upload-Ordner und wird bei Bedarf neu gelesen.
 */
export const UPLOADS_SPEICHER_MAX = 512 * MB;
/** „Zuletzt erstellt“ in der Paketerstellung: so groß darf das gemerkte Archiv sein. */
export const ARCHIV_MERKEN_MAX = 5 * MB;
/**
 * Text-Vorlage in einem Paket (#1038, `inhalt/vorlagen/*.md`): schlichtes Markdown für Briefe wie ein
 * Kündigungsschreiben – 256 KB sind viele Seiten Text. dms-registry prüft in `pruefen.py` dieselbe Grenze.
 */
export const VORLAGE_MAX = 256 * KB;
/**
 * Text setzen (#1040): Vorlage mit eingesetzten Werten höchstens (der ausgefüllte Text) – die Vorlage selbst darf
 * `VORLAGE_MAX` groß sein, Feldwerte kommen dazu. Das PDF darf höchstens `TEXTSATZ_SEITEN` Seiten und `TEXTSATZ_PDF_MAX`
 * Bytes haben; der Satz läuft im Arbeiter und bricht nach `TEXTSATZ_ZEIT_MS` ab. Ein Brief hat wenige Seiten – die
 * Grenzen fangen nur Ausreißer ab (sehr lange Feldwerte, Tabellen aus Platzhaltern).
 */
export const TEXTSATZ_TEXT_MAX = 512 * KB;
export const TEXTSATZ_PDF_MAX = 4 * MB;
export const TEXTSATZ_SEITEN = 30;
export const TEXTSATZ_ZEIT_MS = 30_000;

/* ---------- Läufer der Pakete ---------- */

/** Antwort eines Netzaufrufs eines Pakets. */
export const NETZ_MAX = 10 * MB;
/** Ab diesem Körper darf ein Netzaufruf eines Pakets so lange dauern wie der ganze Aufruf (Hochladen in Teilen, #585). */
export const NETZ_LANG_AB = MB;
/** Token einer Antwort (#565): höchstens so viele Bytes am Ende eines Stücks liest der Läufer nach `usage` ab. */
export const NETZ_TOKEN_LESEN = 16 * KB;
/** Was ein Paket an das nächste weiterreicht (Ergebnis eines Aufrufs). */
export const WEITER_MAX_BYTES = 4 * MB;
/** Gespeicherter Zustand eines Pakets. */
export const PAKET_SPEICHER_MAX = 64 * KB;
/**
 * Paket-Aktionen im Menü „Mappe“ (#1039, Ergänzung Sicherheit): Dialoge sind kurz – höchstens `AKTION_FELDER_MAX`
 * Felder, Texte bis `AKTION_TEXT_MAX` Zeichen (Absatz) bzw. `AKTION_KURZ_MAX` (Name, Knopf, Option), höchstens
 * `AKTION_OPTIONEN_MAX` Optionen, Antworten der Person bis `AKTION_ANTWORT_MAX` Zeichen je Feld. Den Stand zwischen zwei
 * Schritten (`stand`) hält Ablago bis `AKTION_STAND_MAX` Bytes. Dateien, die das Paket während eines Schritts ablegt
 * (neues Dokument, Herausgeben), höchstens `AKTION_DATEI_MAX` groß und `AKTION_DATEIEN_MAX` je Lauf. Ein Schritt wartet
 * `AKTION_ZEIT_MS` auf das Paket, ein offener Dialog lebt `AKTION_LAUF_MS`.
 */
export const AKTION_FELDER_MAX = 30;
export const AKTION_TEXT_MAX = 2000;
export const AKTION_KURZ_MAX = 200;
export const AKTION_OPTIONEN_MAX = 200;
export const AKTION_ANTWORT_MAX = 2000;
export const AKTION_STAND_MAX = 16 * KB;
export const AKTION_DATEI_MAX = 10 * MB;
export const AKTION_DATEIEN_MAX = 3;
export const AKTION_ZEIT_MS = 30_000;
export const AKTION_LAUF_MS = 30 * 60_000;

/* ---------- PDF und Dateien ---------- */

/** Ein Objektstrom (`/ObjStm`, `/XRef`) entpackt höchstens, alle zusammen höchstens (#823). */
export const OBJEKTSTROM_MAX = 64 * MB;
export const OBJEKTSTROEME_MAX = 256 * MB;
/** PDF-Anzeige: Zwischenspeicher insgesamt, mit mehreren Prozessen geteilt (#874, `anteilVon`). */
export const PDF_CACHE_BYTES = 256 * MB;
/** Texterkennung: größere Dateien bekommen keinen Volltext (in MB, so steht es auch in der Werkbank). */
export const TEXTERKENNUNG_MAX_MB = 100;
/** Vorschau von Office-Dateien: Eingabe höchstens. */
export const VORSCHAU_MAX_BYTES = 100 * MB;
/** Verkleinern: kleinere Bilder lohnen sich nicht. */
export const MIN_BILD_BYTES = 24 * KB;
/** Eingebettetes Bild einer E-Mail: kleiner gilt ein Inline-Bild als Teil des Texts, nicht als Anhang. */
export const MAIL_INLINE_BILD_MAX = 100 * KB;
/** Anhänge einer E-Mail zusammen höchstens (#58); die Oberfläche warnt schon ab 20 MB. */
export const EMAIL_MAX_ANHAENGE = 50_000_000;
/** Antwort beim Suchen der E-Mail-Einstellungen eines Anbieters. */
export const MAILSUCHE_ANTWORT_MAX = 64 * KB;
/** Stempeln für WebDAV: so viel Arbeitsspeicher dürfen gestempelte Dokumente zusammen belegen (Anteil je Prozess). */
export const WEBDAV_STEMPEL_SPEICHER = 64 * MB;
/** XML-Körper einer WebDAV-Anfrage (PROPFIND, LOCK …). */
export const WEBDAV_XML_MAX = 64 * KB;
/**
 * E-Rechnung (#1043, XRechnung und ZUGFeRD): so groß darf das XML sein – als Datei und entpackt aus dem PDF-Anhang.
 * Übliche Rechnungen haben wenige KB, große mit vielen Positionen einige hundert; 4 MB lassen Luft, ohne dass ein
 * präpariertes XML den Speicher füllt. Ein größeres wird nicht gelesen (die Erkennung arbeitet dann mit dem Text).
 */
export const ERECHNUNG_XML_MAX = 4 * MB;
/** E-Rechnung: höchstens so tief verschachtelt (UBL und CII brauchen gut 10 Ebenen) und so viele Elemente. */
export const ERECHNUNG_TIEFE_MAX = 64;
export const ERECHNUNG_ELEMENTE_MAX = 200_000;
/** E-Rechnung: höchstens so viele Positionen werden übernommen; weitere bleiben im Original (Hinweis). */
export const ERECHNUNG_POSITIONEN_MAX = 500;

/* ---------- Ausgaben externer Programme (`maxBuffer`) ---------- */

/** Kurze Ausgaben (pdfinfo, Bilder prüfen). */
export const AUSGABE_KLEIN = MB;
/** Fehlermeldungen von Ghostscript beim Verkleinern. */
export const AUSGABE_VERKLEINERN = 4 * MB;
/** Seiten, Vorschau, Demo-Dokumente. */
export const AUSGABE_MITTEL = 16 * MB;
/** Text von Tesseract und Schwärzen. */
export const AUSGABE_GROSS = 64 * MB;
/** PDF/A aus Ghostscript (Ausgabe geht über stdout). */
export const AUSGABE_ARCHIV = 256 * MB;

/* ---------- Sicherung und Platz ---------- */

/** Stücke beim Hochladen einer Sicherung außer Haus (#585). */
export const STUECK_MAX = 8 * MB;
/** Kopf einer Sicherungsdatei. */
export const SICHERUNGSKOPF_MAX = 64 * KB;
/** Frei bleiben muss mindestens so viel über dem, was ein Export oder eine Wiederherstellung braucht. */
export const PLATZ_RESERVE = 50 * MB;
/** Arbeitsspeicher, mit dem ein Prozess rechnet, und Reserve fürs System (#745); Halde je weiterem Prozess mindestens (in MB). */
export const SPEICHER_JE_PROZESS = GB;
export const SPEICHER_RESERVE = GB;
export const HALDE_MIN_MB = GB / MB;

/* ---------- Stücke beim Lesen und Schreiben (keine Grenzen, aber Byte-Zahlen) ---------- */

/** Prüfsumme beim Hochladen in Stücken, dazwischen kurz frei für andere Anfragen (#746). */
export const HOCHLADEN_STUECK = MB;
/** ZIP schreiben. */
export const ZIP_STUECK = 256 * KB;
/** Sicherungsformat lesen und schreiben. */
export const SICHERUNG_STUECK = MB;
/** Vollexport: Zeichen je Stück im Text. */
export const EXPORT_STUECK_ZEICHEN = 64 * KB;
/** Zufallsdaten für Demo-Dokumente: so viele Bytes je Schritt. */
export const ZUFALL_STUECK = MB;

/* ---------- Demo-Daten ---------- */

/** Größtes Demo-Dokument, Vorrat zum Wiederverwenden kleiner Dokumente, Platz alle 200 MB prüfen. */
export const DEMO_GROSS_MAX = 95 * MB;
export const DEMO_VORRAT_MAX = 5 * MB;
export const DEMO_PLATZ_PRUEFEN = 200 * MB;

/* ---------- Mappen-Abläufe (#1044, Bremse) ---------- */

/** Höchstens so viele offene Abläufe je Person und Mappe – niemand plant über die API tausende Aufgaben an andere. */
export const ABLAEUFE_JE_PERSON_UND_MAPPE = 20;
/** Höchstens so viele angewendete Vorlagen je Person und Minute – dieselbe Bremse wie bei Automatisierungen (07b). */
export const ABLAEUFE_JE_MINUTE = AUTOMATISIERUNG_GRENZEN.laeufeJeMinute;
