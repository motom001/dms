import { ERKENNUNGSARTEN } from '../../shared/src/erkennung';
import { FELDFORMATE } from '../../shared/src/feldformate';
import { FELDTYPEN, HERKUNFT, REGISTERARTEN, type Benutzer } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import type { Anfrage, Antwort, Route } from './routen';

/**
 * Öffentliche, stabile Schnittstelle /api/v1 (#20).
 *
 * Sie verwendet dieselben Funktionen wie die Oberfläche, hat aber eigene, feste
 * Adressen: Ändert sich die Oberfläche intern, bleibt /api/v1 gleich. Nur hier
 * gelten API-Schlüssel (Authorization: Bearer dms_…); eine Sitzung der
 * Oberfläche funktioniert ebenfalls. Die OpenAPI-Beschreibung entsteht aus
 * derselben Tabelle und passt damit immer zur installierten Version.
 */

type Schema = Record<string, unknown>;
interface Parameter { name: string; wo: 'path' | 'query'; typ: 'string' | 'integer' | 'boolean'; pflicht?: boolean; beschreibung: string }
interface V1 {
  methode: Route['methode'];
  pfad: string;
  gruppe: 'Konto' | 'Ablage' | 'Dokumente' | 'Werkbank';
  zusammenfassung: string;
  beschreibung?: string;
  /** Interne Route, deren Handler genutzt wird. */
  intern?: { methode: Route['methode']; pfad: string };
  /** Eigener Handler, wenn Parameter abweichen. */
  handler?: (a: Anfrage, intern: (m: Route['methode'], p: string) => Route) => Promise<Antwort>;
  parameter?: Parameter[];
  body?: string | 'binaer';
  antwort?: string | 'binaer' | null;
  status?: number;
}

const passwoerter: Parameter = { name: 'passwoerter', wo: 'query', typ: 'string', beschreibung: '„anzeigen“: Passwortfelder im Klartext statt nur {gesetzt, lesbar}. Nur mit einem API-Schlüssel mit dem Recht „Passwörter lesen“ (sonst 403); jeder Abruf steht im Protokoll.' };
/** Stempel beim Herunterladen (#394). */
const stempelParameter: Parameter[] = [
  { name: 'herunterladen', wo: 'query', typ: 'string', beschreibung: 'Beliebiger Wert: als Datei herunterladen. Über einen API-Schlüssel ist jeder Abruf ein Herunterladen (Weitergeben); Pakete bekommen immer das Original.' },
  { name: 'vorlage', wo: 'query', typ: 'string', beschreibung: 'Id einer Stempel-Vorlage (GET /stempel/vorlagen); eigene Angaben unten gehen vor' },
  { name: 'stempel', wo: 'query', typ: 'string', beschreibung: 'Text des Stempels (höchstens 200 Zeichen) mit Platzhaltern {datum}, {empfänger}, {benutzer}, {mappe}' },
  { name: 'empfaenger', wo: 'query', typ: 'string', beschreibung: 'Wert für {empfänger}; Pflicht, wenn der Text ihn nutzt' },
  { name: 'lage', wo: 'query', typ: 'string', beschreibung: 'diagonal (Wasserzeichen, Standard), kopf, fuss oder ecke' },
  { name: 'deckkraft', wo: 'query', typ: 'string', beschreibung: '0.1 bis 1, Standard 0.25' },
  { name: 'seiten', wo: 'query', typ: 'string', beschreibung: 'alle (Standard) oder erste' },
  { name: 'seitenzahlen', wo: 'query', typ: 'boolean', beschreibung: 'true = Fußzeile „Seite x von y“ auf jeder Seite (auch ohne Stempeltext)' },
  { name: 'archivnummer', wo: 'query', typ: 'boolean', beschreibung: 'true = Archivnummer des Dokuments in der Fußzeile' },
];
const VERKLEINERN_BESCHREIBUNG = ' Verkleinert (#393): Mit verkleinern=bildschirm|standard|druck (oder true = standard) kommt eine verkleinerte Kopie eines PDFs (Bilder auf ca. 100, 150 oder 300 dpi); das gespeicherte Dokument bleibt unverändert, die Antwort trägt den Kopf X-DMS-Verkleinert: <Bytes vorher>/<Bytes nachher>. Bringt es weniger als 10 %, kommt das Original (ohne diesen Kopf). Erst wird verkleinert, dann gestempelt. 422 bei anderen Dateitypen ohne Stempel.';
const verkleinernParameter: Parameter = { name: 'verkleinern', wo: 'query', typ: 'string', beschreibung: 'bildschirm (≈ 100 dpi), standard (≈ 150 dpi) oder druck (≈ 300 dpi): verkleinerte Kopie eines PDFs (#393)' };
const STEMPEL_BESCHREIBUNG = ' Stempel (#394): Mit Stempel-Parametern entsteht eine gestempelte Kopie als PDF (Bilder werden zum PDF); das gespeicherte Original bleibt unverändert, die Historie der Mappe vermerkt die Weitergabe, die Antwort trägt den Kopf X-DMS-Stempel: 1. Verlangt der Mappentyp einen Stempel (Pflicht), wird ohne Parameter seine Vorlage verwendet. 422, wenn sich die Datei nicht stempeln lässt (nur PDF, JPEG, PNG; nicht verschlüsselt) oder der Empfänger fehlt.';

const id = (was: string): Parameter => ({ name: 'id', wo: 'path', typ: 'string', pflicht: true, beschreibung: `Id ${was} (UUID)` });

export const V1_TABELLE: V1[] = [
  { methode: 'GET', pfad: '/ich', gruppe: 'Konto', zusammenfassung: 'Wer bin ich?', beschreibung: 'Benutzer und Rechte des verwendeten Schlüssels.', antwort: 'Ich',
    handler: async (a) => ({ body: { benutzer: a.benutzer, schluessel: a.apiSchluessel ? { name: a.apiSchluessel.name, recht: a.apiSchluessel.recht, passwoerter: a.apiSchluessel.passwoerter, ablauf: a.apiSchluessel.ablauf } : null } }) },

  { methode: 'GET', pfad: '/konto/abwesenheit', gruppe: 'Konto', zusammenfassung: 'Eigene Abwesenheit', beschreibung: 'Abwesenheit mit Vertreter und Anzahl eigener offener Aufgaben.', intern: { methode: 'GET', pfad: '/api/konto/abwesenheit' }, antwort: 'AbwesenheitStand' },
  { methode: 'PUT', pfad: '/konto/abwesenheit', gruppe: 'Konto', zusammenfassung: 'Eigene Abwesenheit setzen', beschreibung: 'Solange sie wirkt (an, und heute im Zeitraum von–bis, beides optional), gehen neue Aufgaben an den Vertreter. Vertreter ist Pflicht, sobald an=true.', intern: { methode: 'PUT', pfad: '/api/konto/abwesenheit' }, body: 'Abwesenheit', antwort: 'Benutzer' },
  { methode: 'GET', pfad: '/konto/zusammenfassung', gruppe: 'Konto', zusammenfassung: 'Tägliche Zusammenfassung: eigene Einstellung', beschreibung: 'Ob, um wie viel Uhr und an welchen Wochentagen die tägliche Zusammenfassung der Aufgaben kommt; uhrzeit null = Standard der Werkbank.', intern: { methode: 'GET', pfad: '/api/konto/zusammenfassung' }, antwort: 'Zusammenfassung' },
  { methode: 'PUT', pfad: '/konto/zusammenfassung', gruppe: 'Konto', zusammenfassung: 'Tägliche Zusammenfassung einstellen', beschreibung: 'uhrzeit im 15-Minuten-Raster (HH:MM) oder null, tage 1 = Montag … 7 = Sonntag (leer = aus), feiertage = nicht an Feiertagen des Bundeslands.', intern: { methode: 'PUT', pfad: '/api/konto/zusammenfassung' }, body: 'ZusammenfassungEingabe', antwort: 'Zusammenfassung' },
  { methode: 'GET', pfad: '/typen', gruppe: 'Ablage', zusammenfassung: 'Alle Mappentypen', beschreibung: 'Felder, Register, Titel-Vorlage und Trefferliste je Typ. Feldschlüssel sind die Namen in `werte` einer Mappe.', intern: { methode: 'GET', pfad: '/api/typen' }, antwort: 'MappentypListe' },
  { methode: 'GET', pfad: '/sichten', gruppe: 'Ablage', zusammenfassung: 'Anzahl Mappen je Typ, je Ansicht und unter „Zu erledigen“', intern: { methode: 'GET', pfad: '/api/sichten' }, antwort: 'Zaehler' },
  { methode: 'GET', pfad: '/sichten/definitionen', gruppe: 'Ablage', zusammenfassung: 'Alle Ansichten', beschreibung: 'Ansichten mit Elternsicht, Reihenfolge, Mappentypen und Bedingungen. Die Mappen einer Ansicht liefert GET /mappen?sicht=<id>.', intern: { methode: 'GET', pfad: '/api/sichten/definitionen' }, antwort: 'SichtListe' },
  {
    methode: 'GET', pfad: '/mappen', gruppe: 'Ablage', zusammenfassung: 'Mappen einer Ansicht, seitenweise',
    beschreibung: 'Mappen eines Typs (oder von „Zu erledigen“), sortiert und seitenweise. `bezuege` enthält Titel und Typ der Mappen, auf die die gelieferten Mappen verweisen.',
    parameter: [
      { name: 'sicht', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Id einer Ansicht, „eingang“, „favoriten“ (eigene Favoriten) oder „typ:<Id eines Mappentyps>“ (alle Mappen dieses Typs, ohne Bedingungen) oder „link“ (Link über Mappentyp und Feldwerte, siehe link). „sicht“ ist die „Ansicht“ der Oberfläche, „eingang“ die Liste „Zu erledigen“ oder „suche“ (erweiterte Suche, siehe link)' },
      { name: 'link', wo: 'query', typ: 'string', beschreibung: 'Mit sicht=link: die Parameter eines Links über Mappentyp und Feldwerte als ein kodierter Wert, z. B. typ%3DRechnung%26bezahlt%3Dnein (#98). Fehler im Link: 422. Mit sicht=suche die Parameter der erweiterten Suche (#199), z. B. typ%3Drechnung%26rechnungsdatum.von%3D2025-03-01%26vertragspartner%3D<Id>%26volltext%3DBackofen%26in%3Ddokumente: typ mehrfach (ohne = alle Typen, nur Systemfelder), feld.von/feld.bis für Datum und Zahlen, feld=wert mehrfach für Verweise und Auswahl (ODER), Ja/Nein ja|nein, Text enthält, feld.leer=1 bzw. feld.nichtleer=1, volltext mit in=dokumente und/oder in=notizen (ohne in: beide). Zwischen Feldern gilt UND. Ungültige Eingaben: 422.' },
      { name: 'von', wo: 'query', typ: 'integer', beschreibung: 'Erster Eintrag (ab 0), Standard 0' },
      { name: 'anzahl', wo: 'query', typ: 'integer', beschreibung: 'Anzahl, 1–500, Standard 100' },
      { name: 'suche', wo: 'query', typ: 'string', beschreibung: 'Text in Titel oder Werten' },
      { name: 'notizen', wo: 'query', typ: 'boolean', beschreibung: 'true = auch in Notizen suchen; Fundstellen stehen in ausschnitte (dokument: „Notiz“)' },
      { name: 'volltext', wo: 'query', typ: 'boolean', beschreibung: 'true = auch im Volltext der Dokumente suchen (deutsche Volltextsuche, z. B. „Rechnungen“ findet „Rechnung“); Fundstellen stehen in ausschnitte' },
      { name: 'sortierung', wo: 'query', typ: 'string', beschreibung: 'Feldschlüssel oder _titel, _typ, _erstellt, _erstelltVon, _geaendert, _geaendertVon; Standard _titel' },
      { name: 'absteigend', wo: 'query', typ: 'boolean', beschreibung: 'true = absteigend' },
      passwoerter,
    ],
    antwort: 'Seite',
    handler: async (a, intern) => {
      if (!a.query.sicht) throw new Fachfehler(422, 'Bitte „sicht“ angeben: die Id eines Mappentyps oder „eingang“.');
      return intern('GET', '/api/mappen').handler(a);
    },
  },
  { methode: 'GET', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Eine Mappe mit Dokumenten und Rückverweisen', intern: { methode: 'GET', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe'), passwoerter], antwort: 'MappeDetails' },
  { methode: 'PUT', pfad: '/mappen/{id}/favorit', gruppe: 'Ablage', zusammenfassung: 'Mappe als Favorit markieren', beschreibung: 'Persönlich für den Benutzer des Schlüssels; ändert weder „zuletzt geändert“ noch die Historie. Mehrfaches Markieren schadet nicht.', intern: { methode: 'PUT', pfad: '/api/mappen/:id/favorit' }, parameter: [id('der Mappe')], antwort: 'Favorit' },
  { methode: 'GET', pfad: '/mappen/{id}/baum', gruppe: 'Ablage', zusammenfassung: 'Alle Mappen, die über Verweise an einer Mappe hängen', beschreibung: 'Baum-Sammlung (#396, #424): Breitensuche ab der Mappe über Verweise – verwiesenVon (Mappen, die darauf verweisen, „nach unten“) und/oder verweistAuf (Mappen, auf die sie verweist). Ohne seitwaerts geht jede Mappe nur in der Richtung weiter, über die sie erreicht wurde. Mit nurZugehoerigkeit geht es nur über Verweisfelder der Art Zugehörigkeit weiter; Mappen, die nur über Bezug verbunden sind, stehen als Blatt da (nurBezug). Kreise werden erkannt (auchUeber, kreise), die Obergrenze max kappt große Bäume (abgeschnitten). Nur Mappen, die der Aufrufer lesen darf; über nicht lesbare geht es nicht weiter (gezählt in verborgen). Benutzer und Rollen sind ausgenommen. Je Knoten: Ebene, über welchen Verweis erreicht, Anzahl Dokumente, Verweise zu Mappen außerhalb des Baums (aussen), Aufbewahrungsfrist (aufbewahrenBis, gesperrt) und die eigenen Rechte.', intern: { methode: 'GET', pfad: '/api/mappen/:id/baum' },
    parameter: [id('der Start-Mappe'), { name: 'tiefe', wo: 'query', typ: 'integer', beschreibung: 'Ebenen, 1 bis 10 (Standard 2)' }, { name: 'richtungen', wo: 'query', typ: 'string', beschreibung: 'verwiesenVon, verweistAuf oder beide mit Komma (Standard beide)' }, { name: 'max', wo: 'query', typ: 'integer', beschreibung: 'höchstens so viele Mappen, 1 bis 5000 (Standard 1000)' }, { name: 'seitwaerts', wo: 'query', typ: 'boolean', beschreibung: 'true: jede Mappe in alle Richtungen weiter (Standard false)' }, { name: 'nurZugehoerigkeit', wo: 'query', typ: 'boolean', beschreibung: 'true: nur über Verweise der Art Zugehörigkeit weitersammeln (Standard false)' }], antwort: 'Baum' },
  { methode: 'GET', pfad: '/mappen/{id}/loeschvorschau', gruppe: 'Ablage', zusammenfassung: 'Mit verknüpften Mappen löschen: Vorschau', beschreibung: 'Mappe mit allen verknüpften Mappen löschen (#424): Baum „nach unten“ (Mappen, die auf die Mappe verweisen, und so weiter; nie nach oben oder seitwärts; ohne Benutzer und Rollen) wie GET /mappen/{id}/baum mit nurZugehoerigkeit: Mitgelöscht und weitergesammelt wird nur über Verweise der Art Zugehörigkeit; Mappen, die nur über Bezug dranhängen (knoten[].nurBezug, 📎), werden nie gelöscht – bei ihnen wird nur der Verweis entfernt. Dazu kanten (alle Verweise im Baum), geteilt (🔗: gehört über Zugehörigkeit auch zu einer Mappe außerhalb – gleicher Typ oder gleiches Feld), nichtLoeschbar (Id → Grund), papierkorbTage und vorschlag (Id → loeschen | entkoppeln | behalten). Gesperrte Mappen (Aufbewahrungsfrist, knoten[].gesperrt) und Mappen ohne Löschrecht (knoten[].rechte.D) werden nie gelöscht. Die Vorschau ändert nichts.', intern: { methode: 'GET', pfad: '/api/mappen/:id/loeschvorschau' },
    parameter: [id('der Start-Mappe'), { name: 'tiefe', wo: 'query', typ: 'integer', beschreibung: 'Ebenen, 1 bis 10 (Standard 5)' }, { name: 'max', wo: 'query', typ: 'integer', beschreibung: 'höchstens so viele Mappen, 1 bis 5000 (Standard 1000)' }], antwort: 'LoeschVorschau' },
  { methode: 'POST', pfad: '/mappen/{id}/mit-verknuepften-loeschen', gruppe: 'Ablage', zusammenfassung: 'Mit verknüpften Mappen löschen: ausführen', beschreibung: 'Sammelt die Vorschau neu (gleiche tiefe/max angeben) und löscht nach auswahl (Id → loeschen | entkoppeln | behalten; fehlende Ids bleiben – z. B. vorschlag aus der Vorschau übernehmen). Dieselben Prüfungen wie in der Vorschau: Rechte, Aufbewahrungsfristen; eine Mappe, auf die eine bleibende Mappe noch verweist, bleibt. entkoppeln entfernt nur die Verweise dieser Mappe auf gelöschte Mappen (Recht „Bearbeiten“). Alles geht als ein Vorgang in den Papierkorb (bei 0 Tagen Aufbewahrung sofort endgültig) und lässt sich mit POST /papierkorb/vorgang/{vorgang}/wiederherstellen gemeinsam wiederherstellen. Bleibt die Start-Mappe wegen Mappen in der Aufbewahrungsfrist, legt das DMS dem Aufrufer an ihr eine Erinnerung zum Tag nach dem spätesten Fristende an (erinnerung). 422, wenn nach der Auswahl nichts gelöscht würde.', intern: { methode: 'POST', pfad: '/api/mappen/:id/mit-verknuepften-loeschen' },
    parameter: [id('der Start-Mappe')], body: 'LoeschAusfuehren', antwort: 'LoeschErgebnis' },
  { methode: 'DELETE', pfad: '/mappen/{id}/favorit', gruppe: 'Ablage', zusammenfassung: 'Favorit entfernen', intern: { methode: 'DELETE', pfad: '/api/mappen/:id/favorit' }, parameter: [id('der Mappe')], antwort: 'Favorit' },
  { methode: 'GET', pfad: '/papierkorb', gruppe: 'Ablage', zusammenfassung: 'Eigener Papierkorb', beschreibung: 'Mappen, die der Benutzer dieses Schlüssels gelöscht hat, neueste zuerst. Nach der eingestellten Aufbewahrung werden sie endgültig gelöscht.', intern: { methode: 'GET', pfad: '/api/papierkorb' }, antwort: 'PapierkorbListe' },
  { methode: 'POST', pfad: '/papierkorb/{id}/wiederherstellen', gruppe: 'Ablage', zusammenfassung: 'Mappe aus dem Papierkorb wiederherstellen', beschreibung: 'Verweise auf Mappen, die es nicht mehr gibt, entfallen; passt die Mappe danach nicht zur Definition (z. B. ein eindeutiger Wert ist inzwischen vergeben), erscheint sie unter „Zu erledigen“.', intern: { methode: 'POST', pfad: '/api/papierkorb/:id/wiederherstellen' }, parameter: [id('der Mappe')], antwort: 'Wiederhergestellt' },
  { methode: 'POST', pfad: '/papierkorb/vorgang/{id}/wiederherstellen', gruppe: 'Ablage', zusammenfassung: 'Einen Vorgang gemeinsam wiederherstellen', beschreibung: 'Alle Mappen, die zusammen „mit verknüpften Mappen“ gelöscht wurden (#424, Feld vorgang im Papierkorb), samt Dokumenten und Verweisen untereinander; Verweise bleibender Mappen, die beim Löschen entfernt wurden, werden wieder gesetzt.', intern: { methode: 'POST', pfad: '/api/papierkorb/vorgang/:id/wiederherstellen' }, parameter: [id('des Vorgangs')], antwort: 'VorgangWiederhergestellt' },
  { methode: 'DELETE', pfad: '/papierkorb/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe endgültig löschen', intern: { methode: 'DELETE', pfad: '/api/papierkorb/:id' }, parameter: [id('der Mappe')], antwort: 'Geloescht' },
  { methode: 'GET', pfad: '/papierkorb/dokumente', gruppe: 'Ablage', zusammenfassung: 'Einzeln gelöschte Dokumente im eigenen Papierkorb', beschreibung: 'Dokumente, die der Benutzer dieses Schlüssels aus einem Register gelöscht hat (#344), neueste zuerst. mappe: da (wiederherstellbar), papierkorb (erst die Mappe wiederherstellen) oder weg.', intern: { methode: 'GET', pfad: '/api/papierkorb/dokumente' }, antwort: 'PapierkorbDokumente' },
  { methode: 'POST', pfad: '/papierkorb/dokumente/{id}/wiederherstellen', gruppe: 'Ablage', zusammenfassung: 'Dokument aus dem Papierkorb wiederherstellen', beschreibung: 'Legt das Dokument mit allen Versionen in dasselbe Register derselben Mappe zurück; braucht das Recht „Bearbeiten“ an der Mappe. 409, wenn die Mappe selbst im Papierkorb liegt oder es sie nicht mehr gibt.', intern: { methode: 'POST', pfad: '/api/papierkorb/dokumente/:id/wiederherstellen' }, parameter: [id('des Dokuments')], antwort: 'DokumentWiederhergestellt' },
  { methode: 'DELETE', pfad: '/papierkorb/dokumente/{id}', gruppe: 'Ablage', zusammenfassung: 'Dokument endgültig löschen', intern: { methode: 'DELETE', pfad: '/api/papierkorb/dokumente/:id' }, parameter: [id('des Dokuments')], antwort: 'Geloescht' },
  { methode: 'DELETE', pfad: '/papierkorb', gruppe: 'Ablage', zusammenfassung: 'Eigenen Papierkorb leeren', intern: { methode: 'DELETE', pfad: '/api/papierkorb' }, antwort: 'Geloescht' },
  { methode: 'GET', pfad: '/aufgaben', gruppe: 'Ablage', zusammenfassung: 'Meine offenen Aufgaben', beschreibung: 'Aufgaben für den Benutzer des Schlüssels (Administratoren: auch die für alle Administratoren), mit Titel und Typ der Mappe.', intern: { methode: 'GET', pfad: '/api/aufgaben' }, antwort: 'AufgabenListe' },
  { methode: 'POST', pfad: '/mappen/{id}/aufgaben', gruppe: 'Ablage', zusammenfassung: 'Aufgabe vergeben', intern: { methode: 'POST', pfad: '/api/mappen/:id/aufgaben' }, parameter: [id('der Mappe')], body: 'AufgabeEingabe', antwort: 'Aufgabe', status: 201 },
  { methode: 'POST', pfad: '/aufgaben/{id}/erledigt', gruppe: 'Ablage', zusammenfassung: 'Aufgabe erledigen', beschreibung: '„Passt nicht“-Aufgaben erledigen sich selbst (409).', intern: { methode: 'POST', pfad: '/api/aufgaben/:id/erledigt' }, parameter: [id('der Aufgabe')], antwort: 'Aufgabe' },
  { methode: 'POST', pfad: '/aufgaben/{id}/rueckgaengig', gruppe: 'Ablage', zusammenfassung: 'Automatische Zuordnung rückgängig machen',
    beschreibung: 'Nur für Aufgaben der Art „zugeordnet“ (#337, „Automatisch zugeordnet – bitte prüfen“): Die Dokumente kommen zurück in die Post, der Verweis auf die Zielmappe fällt weg, der Stand ist wieder „Neu“ (wenn die Post sonst nirgends zugeordnet ist), die Aufgabe ist erledigt; beides steht in der Historie. Diese Post ordnet die Erkennung danach nie wieder von selbst zu. Braucht Bearbeiten an der Post; 409, wenn schon zurückgenommen.',
    intern: { methode: 'POST', pfad: '/api/aufgaben/:id/rueckgaengig' }, parameter: [id('der Aufgabe')], antwort: 'Rueckgaengig' },
  { methode: 'POST', pfad: '/aufgaben/{id}/delegieren', gruppe: 'Ablage', zusammenfassung: 'Aufgabe weitergeben', intern: { methode: 'POST', pfad: '/api/aufgaben/:id/delegieren' }, parameter: [id('der Aufgabe')], body: 'Delegieren', antwort: 'Aufgabe' },
  { methode: 'POST', pfad: '/aufgaben/weitergeben', gruppe: 'Ablage', zusammenfassung: 'Mehrere Aufgaben auf einmal weitergeben', beschreibung: 'Sammel-Weitergabe (#415, #419): je Aufgabe dieselben Rechte wie beim einzelnen Weitergeben (eigene, als Administrator alle); das Ziel muss die jeweilige Mappe lesen dürfen. Was nicht geht, steht mit Grund unter nicht. Jede Weitergabe steht in der Historie ihrer Mappe; der Empfänger bekommt eine Sammelbenachrichtigung unter „Zu erledigen“. Höchstens 1000 Aufgaben.', intern: { methode: 'POST', pfad: '/api/aufgaben/weitergeben' }, body: 'SammelWeitergabe', antwort: 'SammelErgebnis' },
  { methode: 'POST', pfad: '/aufgaben/erledigt', gruppe: 'Ablage', zusammenfassung: 'Mehrere Aufgaben auf einmal erledigen', beschreibung: 'Wie /aufgaben/{id}/erledigt für jede Aufgabe; „Passt nicht“-Aufgaben und fremde Aufgaben stehen mit Grund unter nicht.', intern: { methode: 'POST', pfad: '/api/aufgaben/erledigt' }, body: 'SammelAuswahl', antwort: 'SammelErgebnis' },
  { methode: 'GET', pfad: '/anstehend', gruppe: 'Ablage', zusammenfassung: 'Anstehende Fristen und Erinnerungen', beschreibung: 'Fristen und Erinnerungen des Benutzers dieses Schlüssels bis heute + tage (Standard 30), fällige und kommende, nach Datum.', intern: { methode: 'GET', pfad: '/api/anstehend' }, parameter: [{ name: 'tage', wo: 'query', typ: 'integer', beschreibung: 'Zeitraum in Tagen ab heute (0–366)' }], antwort: 'Anstehend' },
  { methode: 'POST', pfad: '/mappen/{id}/erinnerungen', gruppe: 'Ablage', zusammenfassung: 'Erinnerung anlegen', beschreibung: 'Am Datum wird daraus eine Aufgabe der Art „erinnerung“; liegt es heute oder früher, sofort.', intern: { methode: 'POST', pfad: '/api/mappen/:id/erinnerungen' }, parameter: [id('der Mappe')], body: 'ErinnerungEingabe', antwort: 'Erinnerung', status: 201 },
  { methode: 'PUT', pfad: '/erinnerungen/{id}', gruppe: 'Ablage', zusammenfassung: 'Erinnerung ändern', intern: { methode: 'PUT', pfad: '/api/erinnerungen/:id' }, parameter: [id('der Erinnerung')], body: 'ErinnerungEingabe', antwort: 'Erinnerung' },
  { methode: 'DELETE', pfad: '/erinnerungen/{id}', gruppe: 'Ablage', zusammenfassung: 'Erinnerung löschen', intern: { methode: 'DELETE', pfad: '/api/erinnerungen/:id' }, parameter: [id('der Erinnerung')], antwort: null, status: 204 },
  { methode: 'POST', pfad: '/aufgaben/{id}/folgetermin', gruppe: 'Ablage', zusammenfassung: 'Nächsten Termin einer wiederkehrenden Frist setzen', beschreibung: 'Nur solange das Datumsfeld noch das Datum der Frist hat (sonst 409). Braucht das Recht „Bearbeiten“.', intern: { methode: 'POST', pfad: '/api/aufgaben/:id/folgetermin' }, parameter: [id('der Aufgabe')], antwort: 'Mappe' },
  { methode: 'GET', pfad: '/mappen/{id}/notizen', gruppe: 'Ablage', zusammenfassung: 'Notizen einer Mappe', intern: { methode: 'GET', pfad: '/api/mappen/:id/notizen' }, parameter: [id('der Mappe')], antwort: 'NotizListe' },
  { methode: 'POST', pfad: '/mappen/{id}/notizen', gruppe: 'Ablage', zusammenfassung: 'Notiz anlegen', beschreibung: 'text als formatierter Text (Markdown).', intern: { methode: 'POST', pfad: '/api/mappen/:id/notizen' }, parameter: [id('der Mappe')], body: 'NotizEingabe', antwort: 'Notiz', status: 201 },
  { methode: 'PUT', pfad: '/notizen/{id}', gruppe: 'Ablage', zusammenfassung: 'Notiz ändern', intern: { methode: 'PUT', pfad: '/api/notizen/:id' }, parameter: [id('der Notiz')], body: 'NotizEingabe', antwort: 'Notiz' },
  { methode: 'DELETE', pfad: '/notizen/{id}', gruppe: 'Ablage', zusammenfassung: 'Notiz löschen', intern: { methode: 'DELETE', pfad: '/api/notizen/:id' }, parameter: [id('der Notiz')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/mappen/{id}/historie', gruppe: 'Ablage', zusammenfassung: 'Änderungshistorie einer Mappe', beschreibung: 'Neueste zuerst: angelegt, geändert (mit Feld, alt und neu), Dokumente, Papierkorb, Passwort angezeigt, Notizen, Aufgaben, E-Mails. Einträge sind unveränderlich.', intern: { methode: 'GET', pfad: '/api/mappen/:id/historie' }, parameter: [id('der Mappe')], antwort: 'Historie' },
  { methode: 'POST', pfad: '/mappen/email', gruppe: 'Ablage', zusammenfassung: 'Mehrere Mappen per E-Mail versenden', beschreibung: 'Mehrere Mappen in einer E-Mail (#151, höchstens 100). Anhänge: je Mappe ihre Angaben als PDF („Titel.pdf“, angaben=false lässt sie weg) und die Dokumente – dokumente=„alle“ oder eine Liste von Dokument-Ids (Standard: keine); zusammen höchstens 50 MB. Jede Mappe braucht Lesen und das Recht zu versenden (Recht E einer Ansicht, wie beim Export); fehlt es bei einer, wird nichts verschickt (403). Danach gibt es eine Post (Kanal E-Mail, ausgehend, erledigt), die auf alle Mappen verweist, und in jeder Mappe einen Eintrag in der Historie.', intern: { methode: 'POST', pfad: '/api/mappen/email' }, body: 'EmailMehrere', antwort: 'EmailMehrereVersendet', status: 201 },
  { methode: 'POST', pfad: '/mappen/{id}/email', gruppe: 'Ablage', zusammenfassung: 'Mappe per E-Mail versenden', beschreibung: 'Absender ist die Adresse des DMS, „Antworten an“ der Benutzer des Schlüssels. Anhänge sind Dokumente der Mappe (zusammen höchstens 50 MB). Danach gibt es eine Post-Mappe (Kanal E-Mail, ausgehend, erledigt), die dieser Mappe zugeordnet ist, und einen Protokolleintrag. 409, wenn der Versand nicht eingerichtet ist; 502, wenn der Mailserver ablehnt.', intern: { methode: 'POST', pfad: '/api/mappen/:id/email' }, parameter: [id('der Mappe')], body: 'EmailEingabe', antwort: 'EmailVersendet', status: 201 },
  { methode: 'POST', pfad: '/post', gruppe: 'Ablage', zusammenfassung: 'Post anlegen',
    beschreibung: 'Neue Post (Systemtyp Post, #192): Stand „Neu“, Richtung eingehend, Kanal „API“ (mit Schlüssel) bzw. „Hochgeladen“; Datum heute, wenn nicht angegeben. Dokumente danach mit POST /mappen/{id}/dokumente ins Register „dokumente“ hochladen. 403 ohne das Recht, Post anzulegen.',
    intern: { methode: 'POST', pfad: '/api/post' }, body: 'PostEingabe', antwort: 'Mappe', status: 201 },
  { methode: 'POST', pfad: '/post/{id}/zuordnen', gruppe: 'Ablage', zusammenfassung: 'Post einer Mappe zuordnen',
    beschreibung: 'Die Post verweist danach auf die Mappe („Zugeordnet zu“) und hat Stand „Zugeordnet“. Die gewählten Dokumente (Standard: alle der Post) wandern in ein Dokumentenregister der Zielmappe; mit kopieren=true bleiben sie zusätzlich in der Post (gleiche Datei, kein zweiter Speicherplatz). Mehrmals möglich. Braucht Bearbeiten an Post und Zielmappe.',
    intern: { methode: 'POST', pfad: '/api/mappen/:id/zuordnen' }, parameter: [id('der Post')], body: 'Zuordnen', antwort: 'Zugeordnet' },
  { methode: 'POST', pfad: '/typen/{id}/vorschlaege', gruppe: 'Ablage', zusammenfassung: 'Vorschläge für Mappentyp aus Dokument',
    beschreibung: 'Aus Dokument ausfüllen (#391, eingebaute Erkennung ohne KI): Vorschläge für die Felder des Mappentyps aus text und/oder den Volltexten der Dokumente dokumente (Ids, Lesen nötig; ohne Volltext 409). Mit mappe (Id einer Mappe dieses Typs) braucht es Bearbeiten, sonst das Recht, Mappen des Typs anzulegen. Gefüllt werden die Felder, die „für die Erkennung“ markiert sind (hat der Typ keine, alle mit erkennbarer Art); Passwortfelder und feste Felder nie. Jeder Wert ist gegen die Feldart geprüft: Datum JJJJ-MM-TT, Betrag {betrag, waehrung}, Auswahl nur aus der Liste, Verweis als Mappen-Id einer lesbaren Mappe. Nichts wird gespeichert.',
    intern: { methode: 'POST', pfad: '/api/typen/:id/vorschlaege' }, parameter: [id('des Mappentyps')], body: 'VorschlaegeEingabe', antwort: 'TypVorschlaege' },
  { methode: 'POST', pfad: '/typen/{id}/vorschlaege/datei', gruppe: 'Ablage', zusammenfassung: 'Vorschläge aus einer Datei (Foto, PDF, vCard)',
    beschreibung: 'Wie POST /typen/{id}/vorschlaege, der Text kommt aus der Datei im Körper (roh, höchstens 30 MB): Fotos und PDFs über die Texterkennung (sofort, höchstens 5 Seiten), vCards (.vcf) direkt. Die Datei wird nicht gespeichert; die Antwort enthält zusätzlich text (der gelesene Text, z. B. um Vorder- und Rückseite einer Visitenkarte zusammen an POST /typen/{id}/vorschlaege zu geben). 415 bei anderen Dateiarten, 503 ohne Texterkennung.',
    intern: { methode: 'POST', pfad: '/api/typen/:id/vorschlaege/datei' }, parameter: [id('des Mappentyps'), { name: 'name', wo: 'query', typ: 'string', beschreibung: 'Dateiname (z. B. karte.jpg, kontakt.vcf)' }, { name: 'typ', wo: 'query', typ: 'string', beschreibung: 'MIME-Typ' }, { name: 'mappe', wo: 'query', typ: 'string', beschreibung: 'Id der Mappe, die gefüllt wird (sonst eine neue)' }], body: 'binaer', antwort: 'TypVorschlaege' },
  { methode: 'GET', pfad: '/typen/{id}/erkennungsschema', gruppe: 'Ablage', zusammenfassung: 'Feldbeschreibung für die Erkennung (JSON Schema)',
    beschreibung: 'Die Felder des Mappentyps als JSON Schema 2020-12 (#391): je Feld ein Objekt { wert, sicherheit, fundstelle } mit dem Schema des Werts nach Feldart, Bezeichnung (title), Hilfetext und Erkennungshinweis (description) sowie x-dms-feldtyp, x-dms-erkennung (Art) und x-dms-markiert. Ohne Passwortfelder und feste Felder. So sieht auch die Antwort einer Engine aus Paketen aus (#511).',
    intern: { methode: 'GET', pfad: '/api/typen/:id/erkennungsschema' }, parameter: [id('des Mappentyps')], antwort: 'JsonSchema' },
  { methode: 'GET', pfad: '/post/{id}/erkennung', gruppe: 'Ablage', zusammenfassung: 'Vorschläge beim Zuordnen',
    beschreibung: 'Erkennung (#336), ohne KI: Absender (Mappen, deren für die Erkennung markierte Felder wie Kundennummer, IBAN, E-Mail oder Internetseite im Text stehen – mit Begründung), Datum, Gesamtbetrag und Nummern aus dem Text sowie Vorschläge für die Zielmappe (direkte Treffer, Mappen, die auf den Absender verweisen, frühere Post dieses Absenders). Gerechnet einmal nach dem Volltext; nur Mappen, die der Benutzer des Schlüssels lesen darf. neuerAbsender: Vorschlag „neue Organisation anlegen“, wenn kein Absender passt und der Briefkopf sicher erkennbar ist.',
    intern: { methode: 'GET', pfad: '/api/mappen/:id/erkennung' }, parameter: [id('der Post')], antwort: 'Erkennung' },
  { methode: 'POST', pfad: '/post/{id}/erkennung', gruppe: 'Ablage', zusammenfassung: 'Erkennung neu rechnen',
    beschreibung: 'Rechnet die Vorschläge beim Zuordnen (#336) jetzt neu, z. B. nachdem eine Organisation angelegt wurde. Braucht Lesen.',
    intern: { methode: 'POST', pfad: '/api/mappen/:id/erkennung' }, parameter: [id('der Post')], antwort: 'Erkennung' },
  { methode: 'POST', pfad: '/fotostapel', gruppe: 'Ablage', zusammenfassung: 'Foto für eine Post ablegen',
    beschreibung: 'Post fotografieren (#490): ein Foto (JPEG oder PNG, roh im Körper, höchstens 100 MB) für später; liefert seine Kennung. Erst POST /post/fotos bzw. POST /mappen/{id}/fotos macht daraus Seiten eines PDFs. Nicht verwendete Fotos verfallen nach zwei Stunden.',
    intern: { methode: 'POST', pfad: '/api/fotostapel' }, body: 'binaer', antwort: 'FotoAbgelegt', status: 201 },
  { methode: 'POST', pfad: '/post/fotos', gruppe: 'Ablage', zusammenfassung: 'Post aus Fotos anlegen',
    beschreibung: 'Post fotografieren (#490): Aus den Fotos des Stapels (in dieser Reihenfolge) wird ein PDF – je Foto eine Seite, Lage laut EXIF – und daraus eine neue Post wie mit POST /post (Betreff ohne Angabe „Post vom TT.MM.JJJJ, hh:mm“). Die Fotos sind danach aus dem Stapel. 410, wenn ein Foto verfallen ist.',
    intern: { methode: 'POST', pfad: '/api/post/fotos' }, body: 'PostFotos', antwort: 'PostAusFotos', status: 201 },
  { methode: 'POST', pfad: '/mappen/{id}/fotos', gruppe: 'Ablage', zusammenfassung: 'Fotos als Seiten anhängen',
    beschreibung: 'Seite hinzufügen (#490): Fotos des Stapels als Seiten ans Ende des PDFs dokument (neue Version; ohne Versionierung ersetzt das Ergebnis das bisherige, das in den Papierkorb kommt). Ohne dokument entsteht ein neues PDF „Fotos vom ….pdf“ im ersten (bzw. angegebenen) Dokumentenregister. Braucht Bearbeiten.',
    intern: { methode: 'POST', pfad: '/api/mappen/:id/fotos' }, parameter: [id('der Mappe')], body: 'FotosAnhaengen', antwort: 'FotosAngehaengt', status: 201 },
  { methode: 'POST', pfad: '/post/{id}/zusammenlegen', gruppe: 'Ablage', zusammenfassung: 'Zwei Posts zusammenlegen',
    beschreibung: 'Zusammenlegen (#490): Die Seiten der Post quelle (PDFs und Fotos in ihrer Reihenfolge) kommen ans Ende des ersten PDFs dieser Post (hat sie keins, entsteht eins); quelle kommt in den Papierkorb. Andere Dateiarten: 422. Braucht Bearbeiten an dieser Post und Löschen an quelle.',
    intern: { methode: 'POST', pfad: '/api/post/:id/zusammenlegen' }, parameter: [id('der Post, die bleibt')], body: 'Zusammenlegen', antwort: 'PostAusFotos' },
  { methode: 'POST', pfad: '/mappen', gruppe: 'Ablage', zusammenfassung: 'Mappe anlegen', beschreibung: 'Die Werte werden wie in der Oberfläche geprüft (Pflichtfelder, Längen, eindeutige Werte, Verweise, Formate und Datumsgrenzen). Bei Fehlern: 422 mit den Feldnamen in der Meldung und `details` je Feld.', intern: { methode: 'POST', pfad: '/api/mappen' }, body: 'MappeEingabe', antwort: 'Mappe', status: 201 },
  { methode: 'PUT', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe ändern', beschreibung: 'Übergebene Werte ersetzen die bisherigen; Werte von Feldern, die es im Typ nicht mehr gibt, bleiben erhalten. Formate und Datumsgrenzen (#535) gelten nur für Werte, die sich ändern.', intern: { methode: 'PUT', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], body: 'MappeAenderung', antwort: 'Mappe' },
  { methode: 'DELETE', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe löschen', beschreibung: 'Samt ihrer Dokumente. 409, solange andere Mappen auf sie verweisen. Ist der Papierkorb an, kommt sie dorthin und lässt sich wiederherstellen. Jede Löschung steht im Löschprotokoll (#470) – mit dem API-Schlüssel als „Schnittstelle“.', intern: { methode: 'DELETE', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe'), { name: 'grund', wo: 'query', typ: 'string', beschreibung: 'Grund fürs Löschprotokoll (#470): frist, verlangen, nicht_noetig oder sonstiges' }, { name: 'grundText', wo: 'query', typ: 'string', beschreibung: 'Freier Text zum Grund, ohne Personenbezug (höchstens 200 Zeichen)' }], antwort: null, status: 204 },

  {
    methode: 'POST', pfad: '/mappen/{id}/dokumente', gruppe: 'Dokumente', zusammenfassung: 'Dokument hochladen',
    beschreibung: 'Rohe Bytes der Datei als Body (Content-Type: application/octet-stream), höchstens 100 MB. Gleicher Inhalt wird nur einmal gespeichert; gleicherInhalt nennt die anderen Mappen mit dieser Datei, soweit der Schlüssel sie lesen darf (#333).',
    intern: { methode: 'POST', pfad: '/api/mappen/:id/dokumente' },
    parameter: [id('der Mappe'),
      { name: 'register', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Kennung eines Dokumentenregisters des Mappentyps' },
      { name: 'name', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Dateiname' },
      { name: 'typ', wo: 'query', typ: 'string', beschreibung: 'MIME-Typ (nur Angabe; angezeigt werden PDF und Bilder anhand des Inhalts)' },
      { name: 'gleicherName', wo: 'query', typ: 'string', beschreibung: 'Gibt es im Register schon ein Dokument mit diesem Namen: zaehler (Standard, „Rechnung (2).pdf“), version (neue Version davon; nur mit Versionierung) oder ersetzen (das vorhandene endgültig löschen; nur ohne Versionierung)' }],
    body: 'binaer', antwort: 'Hochgeladen', status: 201,
  },
  {
    methode: 'POST', pfad: '/dokumente/{id}/ersetzen', gruppe: 'Dokumente', zusammenfassung: 'Neue Version eines Dokuments',
    beschreibung: 'Versionierung (#194): Rohe Bytes als Body; das Dokument behält seine Id, die bisherige Datei bleibt als ältere Version. Name und Dateityp dürfen sich ändern. 409, wenn die Versionierung des Registers aus ist.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/ersetzen' },
    parameter: [id('des Dokuments'), { name: 'name', wo: 'query', typ: 'string', beschreibung: 'Neuer Dateiname; ohne Angabe bleibt der bisherige' }, { name: 'typ', wo: 'query', typ: 'string', beschreibung: 'MIME-Typ (nur Angabe)' }],
    body: 'binaer', antwort: 'Dokument', status: 201,
  },
  { methode: 'GET', pfad: '/dokumente/{id}/versionen', gruppe: 'Dokumente', zusammenfassung: 'Versionen eines Dokuments', intern: { methode: 'GET', pfad: '/api/dokumente/:id/versionen' }, parameter: [id('des Dokuments')], antwort: 'Versionen' },
  { methode: 'GET', pfad: '/dokumente/{id}/versionen/{nummer}/inhalt', gruppe: 'Dokumente', zusammenfassung: 'Ältere Version herunterladen', beschreibung: `Wie der Inhalt des Dokuments, mit denselben Stempel-Parametern und verkleinern.${STEMPEL_BESCHREIBUNG}${VERKLEINERN_BESCHREIBUNG}`, intern: { methode: 'GET', pfad: '/api/dokumente/:id/versionen/:nummer/inhalt' }, parameter: [id('des Dokuments'), { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' }, ...stempelParameter, verkleinernParameter], antwort: 'binaer' },
  { methode: 'POST', pfad: '/dokumente/{id}/versionen/{nummer}/zurueckholen', gruppe: 'Dokumente', zusammenfassung: 'Ältere Version zurückholen', beschreibung: 'Übernimmt die Version als neue, höchste Version; es geht nichts verloren.', intern: { methode: 'POST', pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen' }, parameter: [id('des Dokuments'), { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' }], antwort: 'Dokument', status: 201 },
  { methode: 'POST', pfad: '/dokumente/gleiche', gruppe: 'Dokumente', zusammenfassung: 'Gibt es diese Dateien schon?', beschreibung: 'Doppelte Dateien (#333): SHA-256-Prüfwerte (hex, höchstens 100) → Fundstellen je Prüfwert, nur in Mappen, die der Schlüssel lesen darf. Prüfwerte ohne lesbare Fundstelle fehlen in der Antwort. ohneMappe lässt eine Mappe aus (z. B. die, in die man gerade hochlädt).', intern: { methode: 'POST', pfad: '/api/dokumente/gleiche' }, body: 'Gleiche', antwort: 'Fundstellen' },
  { methode: 'GET', pfad: '/dokumente/{id}/inhalt', gruppe: 'Dokumente', zusammenfassung: 'Inhalt eines Dokuments herunterladen', beschreibung: `Ohne Parameter die gespeicherte Datei.${STEMPEL_BESCHREIBUNG}${VERKLEINERN_BESCHREIBUNG} Beispiel: ?vorlage=kopie&empfaenger=Hausverwaltung%20M%C3%BCller oder ?stempel=ENTWURF&lage=diagonal&deckkraft=0.2&seitenzahlen=true oder ?verkleinern=standard.`, intern: { methode: 'GET', pfad: '/api/dokumente/:id/inhalt' }, parameter: [id('des Dokuments'), ...stempelParameter, verkleinernParameter], antwort: 'binaer' },
  { methode: 'GET', pfad: '/stempel/vorlagen', gruppe: 'Dokumente', zusammenfassung: 'Stempel-Vorlagen', beschreibung: 'Vorlagen für Stempel beim Weitergeben (#394): id, name, text mit Platzhaltern, lage, deckkraft, seiten, seitenzahlen, archivnummer. Ob ein Mappentyp einen Stempel vorschlägt oder verlangt, steht an GET /typen unter stempel ({ modus: vorschlag|pflicht, vorlage }).', intern: { methode: 'GET', pfad: '/api/stempel/vorlagen' }, antwort: 'StempelVorlagen' },
  { methode: 'GET', pfad: '/dokumente/{id}/volltext', gruppe: 'Dokumente', zusammenfassung: 'Volltext eines Dokuments', beschreibung: 'Textebene des PDFs oder Ergebnis der Texterkennung; text ist null, solange es keinen gibt (siehe ocr.stand).', intern: { methode: 'GET', pfad: '/api/dokumente/:id/volltext' }, parameter: [id('des Dokuments')], antwort: 'Volltext' },
  { methode: 'PUT', pfad: '/dokumente/{id}/volltext', gruppe: 'Dokumente', zusammenfassung: 'Volltext schreiben', beschreibung: 'Für Pakete mit eigener Texterkennung (#338): ersetzt den Volltext. Dienstkonten brauchen das Recht „Dokumente schreiben“ aus dem Manifest, Benutzer das Recht Bearbeiten an der Mappe. Die Herkunft steht in ocr.info und in der Historie; die eingebaute Texterkennung überschreibt den Text danach nicht mehr von selbst.', intern: { methode: 'PUT', pfad: '/api/dokumente/:id/volltext' }, parameter: [id('des Dokuments')], body: 'VolltextSchreiben', antwort: 'Volltext' },
  { methode: 'GET', pfad: '/dokumente/{id}/seiten/{nr}/scan', gruppe: 'Dokumente', zusammenfassung: 'Seite als Graustufenbild (PGM)', beschreibung: 'Für eine Texterkennung im Paket (#338): die Seite eines PDFs als PGM (8 Bit, „P5 Breite Höhe 255“, danach die Bildpunkte). 404, wenn es die Seite nicht gibt; 422 für andere Dateitypen oder zu große Seiten.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/scan' }, parameter: [id('des Dokuments'), { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seitennummer ab 1' }, { name: 'dpi', wo: 'query', typ: 'integer', beschreibung: 'Auflösung 72–400, ohne Angabe 300' }], antwort: 'binaer' },
  { methode: 'POST', pfad: '/dokumente/{id}/texterkennung', gruppe: 'Dokumente', zusammenfassung: 'Texterkennung (erneut) anstoßen', beschreibung: 'Stellt das Dokument in die Warteschlange der Texterkennung, z. B. nach einem Fehler.', intern: { methode: 'POST', pfad: '/api/dokumente/:id/texterkennung' }, parameter: [id('des Dokuments')], antwort: 'Dokument' },
  { methode: 'GET', pfad: '/dokumente/{id}/seiten', gruppe: 'Dokumente', zusammenfassung: 'Seiten eines PDFs', beschreibung: 'PDF bearbeiten (#335): Seitenzahl und Drehung je Seite (Grad). 422 bei anderen Dateitypen.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten' }, parameter: [id('des Dokuments')], antwort: 'Seiten' },
  { methode: 'GET', pfad: '/dokumente/{id}/seiten/{nr}/bild', gruppe: 'Dokumente', zusammenfassung: 'Bild einer Seite', beschreibung: 'Kleines JPEG (längste Seite 260 px) für eine Seitenansicht; für die ersten 400 Seiten.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/bild' }, parameter: [id('des Dokuments'), { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seitennummer ab 1' }], antwort: 'binaer' },
  {
    methode: 'POST', pfad: '/dokumente/{id}/seiten', gruppe: 'Dokumente', zusammenfassung: 'PDF bearbeiten: drehen, Seiten löschen, umsortieren, teilen',
    beschreibung: 'PDF bearbeiten (#335). seiten = die Seiten des Ergebnisses in der gewünschten Reihenfolge (nr im Original ab 1, drehung zusätzlich im Uhrzeigersinn: 0/90/180/270); fehlende Seiten fallen weg. teile = Positionen in seiten (ab 0), an denen ein neuer Teil beginnt. '
      + 'Ohne teile: neue Version des Dokuments; ist die Versionierung des Registers aus, ersetzt das Ergebnis das Dokument nur mit bestaetigt=true (sonst 409 mit rueckfrage), das bisherige kommt in den Papierkorb. '
      + 'Mit teile in einer Mappe: Teil 1 wird die neue Version, die weiteren Teile werden eigene Dokumente „Name (Teil n).pdf“ im selben Register. '
      + 'Mit teile bei Post („Post teilen nach Seitenbereichen“): je Teil eine neue Post (Stand Neu, Betreff „… (Teil n)“); die Ausgangspost behält ihr Dokument, hat Stand Erledigt und verweist auf die neuen. Texterkennung läuft für die Ergebnisse neu.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/seiten' }, parameter: [id('des Dokuments')], body: 'SeitenBearbeiten', antwort: 'SeitenErgebnis', status: 201,
  },
  {
    methode: 'POST', pfad: '/dokumente/zusammenfuegen', gruppe: 'Dokumente', zusammenfassung: 'PDFs zusammenfügen',
    beschreibung: 'PDF bearbeiten (#335): mehrere PDF-Dokumente (auch aus mehreren Mappen oder Posts, Lesen genügt) in dieser Reihenfolge zu einem neuen Dokument in ziel (Standard: die Mappe des ersten; braucht Bearbeiten). '
      + 'originaleEntfernen=true legt die Ausgangsdokumente in den Papierkorb (braucht Bearbeiten; ohne Papierkorb nur mit bestaetigt=true); eine Post, die dadurch kein Dokument mehr hat, ist danach erledigt und verweist auf das Ziel. Im Archivmodus bleiben die Ausgangsdokumente (409).',
    intern: { methode: 'POST', pfad: '/api/dokumente/zusammenfuegen' }, body: 'Zusammenfuegen', antwort: 'Zusammengefuegt', status: 201,
  },
  { methode: 'GET', pfad: '/dokumente/{id}/schwaerzen', gruppe: 'Dokumente', zusammenfassung: 'Schwärzen: Seiten und Wörter', beschreibung: 'Schwärzen (#392): je Seite die Größe (pt, wie angezeigt) und die Wörter mit Lage als [Text, x, y, b, h] relativ zur Seite (0 bis 1, Ursprung oben links) – aus der Textebene, für Seiten ohne Text per Texterkennung (quelle). Damit lassen sich Suchbegriffe und Muster selbst verorten. Dazu, ob das Register versioniert ist, der Name der Kopie und die Muster. Nur PDF, JPEG und PNG (sonst 422). Braucht Lesen.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen' }, parameter: [id('des Dokuments')], antwort: 'SchwaerzenAnalyse' },
  { methode: 'GET', pfad: '/dokumente/{id}/schwaerzen/seiten/{nr}', gruppe: 'Dokumente', zusammenfassung: 'Schwärzen: Seitenbild', beschreibung: 'Schwärzen (#392): Seite als JPEG (längste Seite 1400 px) in derselben Lage wie die Koordinaten (Bilder nach EXIF-Ausrichtung gedreht). Braucht Lesen.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen/seiten/:nr' }, parameter: [id('des Dokuments'), { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seite ab 1' }], antwort: 'binaer' },
  {
    methode: 'POST', pfad: '/dokumente/{id}/schwaerzen', gruppe: 'Dokumente', zusammenfassung: 'Dokument schwärzen',
    beschreibung: 'Schwärzen (#392): Bereiche (Seite ab 1, x, y, b, h relativ zur Seite), Suchbegriffe (überall, ohne Groß-/Kleinschreibung, auch über Wortgrenzen; getroffen wird das ganze Wort) und/oder Muster (alle Vorschläge dieser Arten) werden endgültig entfernt: Alle Seiten werden neu gerendert (150 dpi), die Bereiche schwarz gefüllt, die Textebene ohne die Wörter darin neu aufgebaut; Metadaten, Anmerkungen, Formulare, eingebettete Dateien und JavaScript entfallen. Bilder bleiben Bilder desselben Typs (ohne EXIF). '
      + 'Ergebnis ist ein neues Dokument „… (geschwärzt)“ im selben Register (ziel=kopie, Standard; Ereignis dokument.hochgeladen) oder eine neue Version (ziel=version, nur mit Versionierung; die ungeschwärzte bleibt als ältere Version). Das Original bleibt unverändert; nicht rückgängig zu machen. Historie „geschwärzte Fassung erstellt“ ohne Suchbegriffe und Inhalt. '
      + '422, wenn nichts zu schwärzen ist (kein Suchbegriff gefunden, keine Bereiche). Braucht Bearbeiten.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/schwaerzen' }, parameter: [id('des Dokuments')], body: 'Schwaerzen', antwort: 'Geschwaerzt', status: 201,
  },
  { methode: 'GET', pfad: '/dokumente/{id}/verkleinern', gruppe: 'Dokumente', zusammenfassung: 'PDF verkleinern: Schätzung', beschreibung: 'PDF verkleinern (#393): Größe, Seiten, Anzahl Bilder, höchste Bildauflösung (dpi) und je Stufe (bildschirm ≈ 100 dpi, standard ≈ 150 dpi, druck ≈ 300 dpi) die geschätzte Größe danach und ob es sich lohnt (mindestens 10 % kleiner). Dazu, ob das Register versioniert ist. 422 bei anderen Dateitypen oder verschlüsselten PDFs. Braucht Lesen.', intern: { methode: 'GET', pfad: '/api/dokumente/:id/verkleinern' }, parameter: [id('des Dokuments')], antwort: 'VerkleinernSchaetzung' },
  {
    methode: 'POST', pfad: '/dokumente/{id}/verkleinern', gruppe: 'Dokumente', zusammenfassung: 'PDF verkleinern',
    beschreibung: 'PDF verkleinern (#393): Bilder werden auf die Auflösung der Stufe heruntergerechnet und als JPEG neu komprimiert, doppelte und unbenutzte Objekte entfernt; Textebene und Volltext bleiben (keine neue Texterkennung). '
      + 'Ergebnis ist eine neue Version (Herkunft „im DMS bearbeitet“, kein Ereignis dokument.hochgeladen); ist die Versionierung des Registers aus, ersetzt es das Dokument nur mit bestaetigt=true (sonst 409 mit rueckfrage), das bisherige kommt in den Papierkorb. '
      + 'Bringt es weniger als 10 %, bleibt das Dokument unverändert: 200 mit unveraendert=true und meldung; sonst 201. Braucht Bearbeiten.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/verkleinern' }, parameter: [id('des Dokuments')], body: 'Verkleinern', antwort: 'Verkleinert', status: 201,
  },
  { methode: 'PUT', pfad: '/dokumente/{id}/archivnummer', gruppe: 'Dokumente', zusammenfassung: 'Archivnummer setzen', beschreibung: 'Archivnummer des Papieroriginals (#345), eindeutig je Haushalt (ohne Groß-/Kleinschreibung); ein vorangestelltes „DMS-ASN:“ aus dem Barcode wird entfernt, leer entfernt die Nummer. 409, wenn ein anderes Dokument sie schon hat. Braucht Bearbeiten an der Mappe.', intern: { methode: 'PUT', pfad: '/api/dokumente/:id/archivnummer' }, parameter: [id('des Dokuments')], body: 'Archivnummer', antwort: 'Dokument' },
  { methode: 'GET', pfad: '/archivnummern/{nr}', gruppe: 'Dokumente', zusammenfassung: 'Dokument zu einer Archivnummer', beschreibung: 'Sucht das Dokument mit dieser Archivnummer (#345, auch mit „DMS-ASN:“ davor); 404, wenn es keins gibt oder die Mappe nicht lesbar ist.', intern: { methode: 'GET', pfad: '/api/archivnummern/:nr' }, parameter: [{ name: 'nr', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Archivnummer, z. B. A-000123' }], antwort: 'ArchivnummerTreffer' },
  { methode: 'DELETE', pfad: '/dokumente/{id}', gruppe: 'Dokumente', zusammenfassung: 'Dokument löschen', beschreibung: 'Ist der Papierkorb eingeschaltet, kommt das Dokument mit allen Versionen in den Papierkorb (#344); sonst ist es endgültig weg. Steht im Löschprotokoll (#470) mit Prüfsumme, ohne Dateinamen.', intern: { methode: 'DELETE', pfad: '/api/dokumente/:id' }, parameter: [id('des Dokuments'), { name: 'grund', wo: 'query', typ: 'string', beschreibung: 'Grund fürs Löschprotokoll (#470): frist, verlangen, nicht_noetig oder sonstiges' }, { name: 'grundText', wo: 'query', typ: 'string', beschreibung: 'Freier Text zum Grund, ohne Personenbezug (höchstens 200 Zeichen)' }], antwort: null, status: 204 },

  { methode: 'POST', pfad: '/typen', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp anlegen (Administrator)', intern: { methode: 'POST', pfad: '/api/typen' }, body: 'MappentypEingabe', antwort: 'Mappentyp', status: 201 },
  { methode: 'PUT', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp ändern (Administrator)', beschreibung: 'Titel und Passung aller Mappen des Typs werden neu berechnet.', intern: { methode: 'PUT', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], body: 'MappentypEingabe', antwort: 'Mappentyp' },
  { methode: 'DELETE', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp löschen (Administrator)', beschreibung: 'Nur ohne Mappen und ohne Verweise anderer Typen.', intern: { methode: 'DELETE', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Alle Benutzer (Administrator)', intern: { methode: 'GET', pfad: '/api/benutzer' }, antwort: 'BenutzerListe' },
  { methode: 'POST', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Benutzer anlegen und einladen (Administrator)', intern: { methode: 'POST', pfad: '/api/benutzer' }, body: 'BenutzerEingabe', antwort: 'LinkErgebnis', status: 201 },
  { methode: 'PUT', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer ändern (Administrator)', intern: { methode: 'PUT', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], body: 'BenutzerAenderung', antwort: 'Benutzer' },
  { methode: 'DELETE', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer löschen (Administrator)', beschreibung: 'Nur solange die Einladung nie angenommen wurde; wer sich schon angemeldet hat, wird über PUT mit aktiv=false deaktiviert.', intern: { methode: 'DELETE', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/werkbank/verkleinern', gruppe: 'Werkbank', zusammenfassung: 'Große PDFs (Administrator)', beschreibung: 'PDF verkleinern (#393): PDF-Dokumente ab einer Größe, größte zuerst (höchstens 200), für die ersten 60 mit geschätzter Größe nach dem Verkleinern in der Stufe.', intern: { methode: 'GET', pfad: '/api/werkbank/verkleinern' }, parameter: [{ name: 'ab', wo: 'query', typ: 'string', beschreibung: 'Ab dieser Größe in MB (Standard 2)' }, { name: 'stufe', wo: 'query', typ: 'string', beschreibung: 'bildschirm, standard (Standard) oder druck' }], antwort: 'GrossePdfs' },
  { methode: 'POST', pfad: '/werkbank/verkleinern', gruppe: 'Werkbank', zusammenfassung: 'Große PDFs verkleinern (Administrator)', beschreibung: 'Sammelaktion (#393) als Hintergrundauftrag (Stand: GET /api/werkbank/auftrag): jedes Dokument wie POST /dokumente/{id}/verkleinern. ohneOriginal=true behält die bisherige Version nicht (gibt den Platz sofort frei; nicht während einer Aufbewahrungsfrist). Register ohne Versionierung nur mit bestaetigt=true.', intern: { methode: 'POST', pfad: '/api/werkbank/verkleinern' }, body: 'VerkleinernViele', antwort: 'Auftrag', status: 202 },
  { methode: 'GET', pfad: '/werkbank/datenschutz', gruppe: 'Werkbank', zusammenfassung: 'Datenschutz: Einstellungen und bereitliegende Auskünfte (Administrator)', beschreibung: 'Auskunft nach Art. 15 DSGVO (#396): Verantwortlicher, Empfänger, Text zu den Rechten, je Mappentyp „betrifft eine Person“ und Zweck; dazu die erzeugten Auskünfte, die noch zum Herunterladen bereitliegen (höchstens 7 Tage, nach dem Herunterladen gelöscht).', intern: { methode: 'GET', pfad: '/api/werkbank/datenschutz' }, antwort: 'DatenschutzStand' },
  { methode: 'PUT', pfad: '/werkbank/datenschutz', gruppe: 'Werkbank', zusammenfassung: 'Datenschutz: Einstellungen speichern (Administrator)', intern: { methode: 'PUT', pfad: '/api/werkbank/datenschutz' }, body: 'Datenschutz', antwort: 'Datenschutz' },
  { methode: 'GET', pfad: '/werkbank/loeschprotokoll', gruppe: 'Werkbank', zusammenfassung: 'Löschprotokoll (Administrator)', beschreibung: 'Löschprotokoll (#470), neueste zuerst: je Schritt (papierkorb, endgueltig, wiederhergestellt) ein Eintrag für die Mappe (Mappentyp, Id, Nummer, Anzahl Dokumente/Notizen/entfernte Verweise) und je Dokument bzw. ältere Version (SHA-256, Größe, Dateityp, Seiten, Archivnummer) – keine Titel, Feldwerte oder Dateinamen. Dazu wann, von wem (Benutzer, Schnittstelle, Paket, automatisch), warum und Vorgang (#424). Nicht änderbar.', intern: { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll' }, parameter: [
    { name: 'von', wo: 'query', typ: 'string', beschreibung: 'ab Tag (JJJJ-MM-TT)' }, { name: 'bis', wo: 'query', typ: 'string', beschreibung: 'bis Tag (JJJJ-MM-TT)' }, { name: 'typId', wo: 'query', typ: 'string', beschreibung: 'Mappentyp' },
    { name: 'grund', wo: 'query', typ: 'string', beschreibung: 'frist, verlangen, nicht_noetig, sonstiges oder ohne' }, { name: 'schritt', wo: 'query', typ: 'string', beschreibung: 'papierkorb, endgueltig oder wiederhergestellt' },
    { name: 'vorgang', wo: 'query', typ: 'string', beschreibung: 'Vorgang oder Mappen-Id' }, { name: 'suche', wo: 'query', typ: 'string', beschreibung: 'Nummer, Archivnummer, Id oder Prüfsumme (SHA-256, 64 Zeichen)' }, { name: 'max', wo: 'query', typ: 'string', beschreibung: 'höchstens (Standard 500, bis 2000)' }], antwort: 'Loeschprotokoll' },
  { methode: 'GET', pfad: '/werkbank/loeschprotokoll/datei', gruppe: 'Werkbank', zusammenfassung: 'Löschprotokoll als PDF oder CSV (Administrator)', beschreibung: 'Dieselben Filter wie GET /werkbank/loeschprotokoll (bis 20.000 Einträge).', intern: { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll/datei' }, parameter: [{ name: 'format', wo: 'query', typ: 'string', beschreibung: 'pdf (Standard) oder csv' }], antwort: 'binaer' },
  { methode: 'PUT', pfad: '/werkbank/loeschprotokoll/einstellungen', gruppe: 'Werkbank', zusammenfassung: 'Aufbewahrung des Löschprotokolls (Administrator)', beschreibung: 'jahre: 1–30 (Standard 10); ältere Einträge fallen beim stündlichen Aufräumen weg.', intern: { methode: 'PUT', pfad: '/api/werkbank/loeschprotokoll/einstellungen' }, body: 'LoeschprotokollEinstellung', antwort: 'LoeschprotokollEinstellung' },
  { methode: 'GET', pfad: '/werkbank/datenschutz/loeschkonzept', gruppe: 'Werkbank', zusammenfassung: 'Löschkonzept erzeugen (Administrator)', beschreibung: 'Löschkonzept (#469) wie die Vorlage im Administratorhandbuch, Abschnitt 2 „Datenarten und Fristen“ aus den Mappentypen mit Personenbezug, Zweck und Archivmodus; weitere Abschnitte mit den Einstellungen (Papierkorb, Sicherungen). Was das DMS nicht weiß, steht in [eckigen Klammern]. Nur Typen, Einstellungen und Fristen – nichts aus Mappen. Lücken liefert GET /werkbank/datenschutz unter loeschkonzept.luecken.', intern: { methode: 'GET', pfad: '/api/werkbank/datenschutz/loeschkonzept' }, parameter: [{ name: 'format', wo: 'query', typ: 'string', beschreibung: 'pdf (Standard) oder docx' }], antwort: 'binaer' },
  { methode: 'POST', pfad: '/werkbank/auskunft/vorschau', gruppe: 'Werkbank', zusammenfassung: 'Auskunft: sammeln und Prüfliste (Administrator)', beschreibung: 'Auskunft nach Art. 15 DSGVO (#396, #472): Baum ab der Mappe des Betroffenen (wie GET /mappen/{id}/baum mit nurZugehoerigkeit, ohne Benutzer und Rollen): nach unten alles, nach oben nur weiter nach oben; weiter nur über Verweise der Art Zugehörigkeit. Mappen, die nur über Bezug verbunden sind (baum.knoten[].nurBezug, z. B. Vertrag mit der Person als Ansprechpartner), gehen standardmäßig nur als Erwähnung hinaus (auswahl.erwaehnungen). Je Mappe Dokumente (mit geschwärzten Fassungen), Notizen, Anzahl Einträge der Historie, Hinweis auf Daten Dritter und die Passwortfelder, die nie mitgehen. Volltext-Vorschläge gibt es nicht mehr; die Eingabe vorschlaege wird ignoriert.', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft/vorschau' }, body: 'AuskunftVorschauEingabe', antwort: 'AuskunftVorschau' },
  { methode: 'POST', pfad: '/werkbank/auskunft', gruppe: 'Werkbank', zusammenfassung: 'Auskunft als ZIP erzeugen (Administrator)', beschreibung: 'Hintergrundauftrag (Stand: GET /api/werkbank/auftrag, Ergebnis AuskunftStand). Nur ausdrücklich Ausgewähltes geht hinaus, geprueft=true ist Pflicht; jede abgewählte Notiz einer ausgewählten Mappe braucht eine Begründung. Passwortfelder, verschlüsselte Werte und ältere Versionen sind nie enthalten. Mit passwort (mindestens 10 Zeichen) liegt die Auskunft als „Auskunft.zip“ in einer AES-256-verschlüsselten ZIP. Nachweis in der Historie des Betroffenen und im Protokoll, ohne Inhalte.', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft' }, body: 'AuskunftEingabe', antwort: 'Auftrag', status: 202 },
  { methode: 'POST', pfad: '/werkbank/auskunft/frist', gruppe: 'Werkbank', zusammenfassung: 'Auskunft: Frist als Aufgabe (Administrator)', beschreibung: 'Aufgabe „Auskunft nach Art. 15 DSGVO an … bis …“ an der Mappe des Betroffenen für den Aufrufer, fällig einen Monat nach dem Eingang der Anfrage (Art. 12 Abs. 3 DSGVO).', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft/frist' }, body: 'AuskunftFrist', antwort: 'Aufgabe', status: 201 },
  { methode: 'GET', pfad: '/werkbank/auskunft/{id}/zip', gruppe: 'Werkbank', zusammenfassung: 'Auskunft herunterladen (Administrator)', beschreibung: 'Die ZIP-Datei; danach wird sie gelöscht (404 beim zweiten Abruf).', intern: { methode: 'GET', pfad: '/api/werkbank/auskunft/:id/zip' }, parameter: [id('der Auskunft')], antwort: 'binaer' },
  { methode: 'DELETE', pfad: '/werkbank/auskunft/{id}', gruppe: 'Werkbank', zusammenfassung: 'Auskunft löschen (Administrator)', beschreibung: 'Gültige Abruf-Links dieser Auskunft werden dabei zurückgezogen (#455).', intern: { methode: 'DELETE', pfad: '/api/werkbank/auskunft/:id' }, parameter: [id('der Auskunft')], antwort: null, status: 204 },
  { methode: 'POST', pfad: '/werkbank/auskunft/{id}/email', gruppe: 'Werkbank', zusammenfassung: 'Auskunft per E-Mail senden (Administrator)', beschreibung: 'Auskunft zustellen, Weg 1 (#455): die ZIP als Anhang über den E-Mail-Versand des DMS. Nur für Auskünfte mit Passwort (sonst 422); das Passwort kennt das DMS nicht und schickt es nie mit – teile es auf einem anderen Weg mit. Größer als 50 MB: 413, dann den Abruf-Link nutzen. Ohne betreff/nachricht gilt ein Vorschlag in Du-Form. Nachweis in der Historie der Person.', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/email' }, parameter: [id('der Auskunft')], body: 'AuskunftEmail', antwort: 'AuskunftEmailErgebnis' },
  { methode: 'POST', pfad: '/werkbank/auskunft/{id}/link', gruppe: 'Werkbank', zusammenfassung: 'Abruf-Link für eine Auskunft erstellen (Administrator)', beschreibung: 'Auskunft zustellen, Weg 2 (#455): Link auf die öffentliche Abrufseite (/abruf#<Schlüssel>, 256 Bit) mit Abrufcode (8 Zeichen, oder ein eigener ab 6 Zeichen). Link und Code stehen nur in dieser Antwort im Klartext. Gültig tage Tage (1–90, Standard 30), höchstens abrufe Abrufe (1–10, Standard 3); ein noch gültiger Link derselben Auskunft wird zurückgezogen. Mit senden=true geht der Link – ohne Code – per E-Mail an an. Die ZIP bleibt, solange der Link gilt.', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/link' }, parameter: [id('der Auskunft')], body: 'AuskunftLinkEingabe', antwort: 'AuskunftLinkNeu', status: 201 },
  { methode: 'POST', pfad: '/werkbank/auskunft/link/{id}/widerrufen', gruppe: 'Werkbank', zusammenfassung: 'Abruf-Link zurückziehen (Administrator)', beschreibung: 'Der Link gilt sofort nicht mehr (#455); der Eintrag bleibt als Nachweis. Für die ZIP gilt wieder das ursprüngliche Ende (7 Tage nach dem Erstellen).', intern: { methode: 'POST', pfad: '/api/werkbank/auskunft/link/:id/widerrufen' }, parameter: [id('des Links')], antwort: 'AuskunftLink' },
  { methode: 'GET', pfad: '/rollen', gruppe: 'Werkbank', zusammenfassung: 'Alle Rollen (Administrator)', beschreibung: 'Systemrollen (Administrator, Mitglied) zuerst. Rollen selbst sind Mappen des Systemmappentyps „Rolle“ und werden wie andere Mappen angelegt, geändert und gelöscht.', intern: { methode: 'GET', pfad: '/api/rollen' }, antwort: 'RollenListe' },
];

/** Routen /api/v1/… aus der Tabelle; Handler und Zugang kommen von den internen Routen. */
export function v1Routen(intern: Route[]): Route[] {
  const finde = (m: Route['methode'], p: string) => {
    const r = intern.find((x) => x.methode === m && x.pfad === p);
    if (!r) throw new Error(`Interne Route fehlt: ${m} ${p}`);
    return r;
  };
  return V1_TABELLE.map((e) => {
    const basis = e.intern ? finde(e.intern.methode, e.intern.pfad) : undefined;
    return {
      methode: e.methode,
      pfad: `/api/v1${e.pfad.replace(/\{(\w+)\}/g, ':$1')}`,
      zugang: basis?.zugang ?? 'angemeldet',
      roh: basis?.roh,
      api: true,
      handler: e.handler ? (a: Anfrage) => e.handler!(a, finde) : basis!.handler,
    } satisfies Route;
  });
}

/* ---------- OpenAPI ---------- */

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const liste = (n: string) => ({ type: 'array', items: ref(n) });
const uuid = { type: 'string', format: 'uuid' };
const zeit = { type: 'string', format: 'date-time' };
const weitereRollen = { type: 'array', items: uuid, description: 'Weitere (fachliche) Rollen: Ids von Rollen-Mappen, ohne Administrator und Mitglied' };

const SCHEMAS: Record<string, Schema> = {
  Fehler: { type: 'object', required: ['fehler'], properties: { fehler: { type: 'string', description: 'Meldung auf Deutsch' }, details: { description: 'Je nach Fehler, z. B. Prüfergebnis bei 422' } } },
  Pruefergebnis: { type: 'object', properties: { allgemein: { type: 'array', items: { type: 'string' } }, felder: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, description: 'Meldungen je Feldschlüssel' } } },
  Feld: {
    type: 'object', required: ['key', 'label', 'typ'],
    properties: {
      key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, label: { type: 'string' }, typ: { type: 'string', enum: Object.keys(FELDTYPEN) },
      pflicht: { type: 'boolean' }, eindeutig: { type: 'boolean' }, hilfe: { type: 'string' }, minLen: { type: 'integer' }, maxLen: { type: 'integer' },
      min: { oneOf: [{ type: 'number' }, { type: 'string' }], description: 'Zahl und Betrag: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT – frühestes erlaubtes Datum' },
      max: { oneOf: [{ type: 'number' }, { type: 'string' }], description: 'Zahl und Betrag: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT – spätestes erlaubtes Datum, z. B. heute für einen Geburtstag' }, nachkomma: { type: 'integer' }, muster: { type: 'string' }, optionen: { type: 'array', items: { type: 'string' } },
      system: { type: 'boolean', readOnly: true, description: 'Systemfeld eines Systemmappentyps: nicht entfernbar, nur Bezeichnung und Hilfetext änderbar' },
      mehrfach: { type: 'boolean' }, zielTyp: { ...uuid, description: 'Bei typ=referenz: Id des Ziel-Mappentyps' }, verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] }, waehrung: { type: 'string' },
      erkennung: { type: 'object', nullable: true, description: 'Für die Erkennung nutzen (#336, #391); vorhanden = an. Nur bei Text, Langtext, Zahl, Betrag, Datum, Auswahl und Verweis. art: was im Feld steht (fehlt = aus Feldart und Bezeichnung), hinweis: Erkennungshinweis, z. B. „Muster 100-####“ (# = Ziffer).', properties: { art: { type: 'string', enum: Object.keys(ERKENNUNGSARTEN) }, hinweis: { type: 'string', maxLength: 300 } } },
      format: { type: 'string', nullable: true, enum: [...FELDFORMATE], description: 'Nur bei typ=text (#535): Format der Angabe. Neue und geänderte Werte müssen passen, gespeicherte bleiben gültig.' },
      landFeld: { type: 'string', nullable: true, description: 'Bei format=plz (#535): Kennung des Felds mit dem Land. Steht dort Deutschland (oder nichts), hat die PLZ genau 5 Ziffern.' },
    },
  },
  Register: { type: 'object', required: ['key', 'name', 'art'], properties: { key: { type: 'string' }, name: { type: 'string' }, art: { type: 'string', enum: Object.keys(REGISTERARTEN) }, felder: { type: 'array', items: { type: 'string' } }, quellen: { type: 'array', items: { type: 'object', properties: { typId: uuid, feldKey: { type: 'string' }, trefferliste: { type: 'string', description: 'Kennung einer Trefferliste des Quelltyps; das Register zeigt dann deren Spalten' } } } } } },
  MappentypEingabe: {
    type: 'object', required: ['name', 'felder'],
    properties: { autoZuordnen: { type: 'boolean', description: 'Post automatisch zuordnen, wenn die Erkennung sicher ist (#337): Absender eindeutig (z. B. Kundennummer, IBAN) und genau eine passende Mappe dieses Typs. Standard false; bei Archivmodus wirkungslos. Der Empfänger bekommt eine Aufgabe „Automatisch zugeordnet – bitte prüfen“ mit Rückgängig.' },
      ausDokument: { type: 'object', nullable: true, description: '„Aus Dokument ausfüllen“ (#391): eigene Beschriftung des Knopfs (höchstens 40 Zeichen) oder aus = true blendet ihn aus; null = Standard. Systemtypen haben den Knopf nie.', properties: { aus: { type: 'boolean' }, beschriftung: { type: 'string', example: 'Visitenkarte scannen' } } },
      name: { type: 'string' }, schluessel: { type: 'string', example: 'rechnung', description: 'Feste Kennung; beim Anlegen frei wählbar (sonst aus dem Namen), danach unveränderlich' }, beschreibung: { type: 'string' }, titelVorlage: { type: 'string', example: '{rechnungsnummer} vom {rechnungsdatum}' }, felder: liste('Feld'), register: liste('Register'),
      trefferlisten: { type: 'array', description: 'Trefferlisten; genau eine ist Standard', items: { type: 'object', required: ['key', 'name', 'spalten'], properties: { key: { type: 'string' }, name: { type: 'string' }, spalten: { type: 'array', items: { type: 'string' }, description: 'Feldschlüssel oder _titel, _erstellt, _erstelltVon, _geaendert, _geaendertVon' }, standard: { type: 'boolean' } } } },
      trefferliste: { type: 'array', items: { type: 'string' }, description: 'Spalten der Standard-Trefferliste (ältere Form); wenn angegeben, ersetzt sie deren Spalten' },
      archiv: { type: 'object', nullable: true, description: 'Archivmodus (#212); null = aus. Frist bis Ende des Kalenderjahres des Stichtags + jahre; vorher kein Löschen (409). Die Versionierung der Dokumentenregister ist dann Pflicht.', properties: { jahre: { type: 'integer', minimum: 1, maximum: 30 }, stichtag: { type: 'string', nullable: true, description: 'Kennung eines Datumsfelds; null = Anlagedatum' } } },
      erstellenErlaubt: { type: 'boolean', default: true, deprecated: true, description: 'Ohne Wirkung seit 0.32 – wer anlegen darf, regeln die Berechtigungen (Recht C)' },
      sichtAnlegen: { type: 'boolean', default: true, writeOnly: true, description: 'Nur beim Anlegen: eigene Ansicht in der Ablage anlegen' },
      loeschenErlaubt: { type: 'boolean', default: true, deprecated: true, description: 'Ohne Wirkung seit 0.32 – wer löschen darf, regeln die Berechtigungen (Recht D)' } },
  },
  Mappentyp: { allOf: [ref('MappentypEingabe'), { type: 'object', properties: { id: uuid, erstellt: zeit, geaendert: zeit, system: { type: 'string', enum: ['benutzer', 'rolle', 'post'], nullable: true, description: 'Systemmappentyp: lässt sich erweitern, aber nicht löschen' }, stempel: { type: 'object', nullable: true, description: 'Stempel beim Weitergeben (#394): vorschlag oder pflicht, mit Id der Vorlage; null = kein Stempel', properties: { modus: { type: 'string', enum: ['vorschlag', 'pflicht'] }, vorlage: { type: 'string', nullable: true } } } } }] },
  MappentypListe: liste('Mappentyp'),
  Werte: {
    type: 'object', additionalProperties: true,
    description: 'Werte je Feldschlüssel: Text und Datum (JJJJ-MM-TT) als string, Zahl als number, Ja/Nein als boolean, Betrag als {betrag, waehrung}, Auswahl als string (mehrfach: string[]), Verweis als Mappen-Id (mehrfach: string[]). Passwort: beim Lesen nur {gesetzt, lesbar} (Klartext mit ?passwoerter=anzeigen); zum Setzen ein Text oder {neu}, zum Entfernen null, unverändert lassen durch Weglassen.',
    example: { rechnungsnummer: 'R-2026-17', rechnungsdatum: '2026-10-01', betrag: { betrag: 49.9, waehrung: 'EUR' }, bezahlt: false },
  },
  Mappe: {
    type: 'object',
    properties: {
      id: uuid, typId: uuid, werte: ref('Werte'), titel: { type: 'string', description: 'Vom Server aus der Titel-Vorlage berechnet' },
      erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, geaendert: zeit, geaendertVon: { ...uuid, nullable: true },
      passt: { type: 'boolean', description: 'Passt zur aktuellen Definition des Typs' }, problem: { type: 'string', nullable: true }, demo: { type: 'boolean' },
      systemKennung: { type: 'string', nullable: true, description: 'Mappen, die das System pflegt, z. B. rolle:admin und rolle:mitglied' },
    },
  },
  MappeEingabe: { type: 'object', required: ['typId', 'werte'], properties: { typId: uuid, werte: ref('Werte') } },
  MappeAenderung: { type: 'object', required: ['werte'], properties: { werte: ref('Werte') } },
  Bezug: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } },
  PapierkorbEintrag: {
    type: 'object',
    properties: {
      id: uuid, typId: uuid, titel: { type: 'string' }, werte: ref('Werte'), demo: { type: 'boolean' },
      erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, geaendert: zeit, geaendertVon: { ...uuid, nullable: true },
      geloescht: zeit, geloeschtVon: { ...uuid, nullable: true }, dokumente: { type: 'integer', description: 'Anzahl Dokumente, die mit ihr im Papierkorb liegen' },
      vorgang: { ...uuid, nullable: true, description: 'Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs' },
      entkoppelt: { type: 'array', description: 'Verweise bleibender Mappen auf diese, die beim Löschen entfernt wurden (#424)', items: { type: 'object', properties: { quelleId: uuid, feldKey: { type: 'string' } } } },
    },
  },
  PapierkorbListe: liste('PapierkorbEintrag'),
  Wiederhergestellt: { type: 'object', properties: { mappe: ref('Mappe'), verweiseEntfallen: { type: 'integer', description: 'Verweise auf Mappen, die es nicht mehr gibt' } } },
  LoeschVorschau: { type: 'object', properties: { baum: ref('Baum'), kanten: { type: 'array', items: { type: 'object', properties: { quelleId: uuid, feldKey: { type: 'string' }, zielId: uuid } } }, geteilt: { type: 'array', items: uuid }, nichtLoeschbar: { type: 'object', additionalProperties: { type: 'string' } }, vorschlag: { type: 'object', additionalProperties: { type: 'string', enum: ['loeschen', 'entkoppeln', 'behalten'] } }, papierkorbTage: { type: 'integer' } } },
  LoeschAusfuehren: { type: 'object', required: ['auswahl'], properties: { auswahl: { type: 'object', additionalProperties: { type: 'string', enum: ['loeschen', 'entkoppeln', 'behalten'] }, description: 'Mappen-Id → Aktion; fehlende Ids bleiben' }, tiefe: { type: 'integer' }, max: { type: 'integer' } } },
  LoeschErgebnis: { type: 'object', properties: { vorgang: uuid, endgueltig: { type: 'boolean', description: 'true = kein Papierkorb, sofort endgültig' }, zahlen: { type: 'object', properties: { mappen: { type: 'integer' }, dokumente: { type: 'integer' }, frist: { type: 'integer' }, ohneRecht: { type: 'integer' }, verweise: { type: 'integer' }, gehalten: { type: 'integer' }, abgewaehlt: { type: 'integer' } } }, loeschen: { type: 'array', items: uuid }, entkoppeln: { type: 'array', items: { type: 'object' } }, erinnerung: { type: 'object', nullable: true, description: 'Erinnerung zum Fristende (#424): blieb die Start-Mappe wegen Mappen in der Aufbewahrungsfrist, eine Erinnerung für den Aufrufer an der Start-Mappe zum Tag nach dem spätesten Fristende', properties: { id: uuid, datum: { type: 'string', format: 'date' }, text: { type: 'string' } } } } },
  VorgangWiederhergestellt: { type: 'object', properties: { mappen: { type: 'integer' }, verweiseWieder: { type: 'integer' }, verweiseEntfallen: { type: 'integer' }, startId: { ...uuid, nullable: true } } },
  Geloescht: { type: 'object', properties: { geloescht: { type: 'integer', description: 'Anzahl endgültig gelöschter Mappen' } } },
  Dokument: {
    type: 'object',
    properties: {
      id: uuid, mappeId: uuid, registerKey: { type: 'string' }, name: { type: 'string' }, mime: { type: 'string' }, groesse: { type: 'integer' }, sha256: { type: 'string' }, anzeigbar: { type: 'boolean' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true },
      ocr: { type: 'object', description: 'Stand der Texterkennung', properties: { stand: { type: 'string', enum: ['keiner', 'wartet', 'laeuft', 'fertig', 'fehler', 'ausgelassen'] }, info: { type: 'string', nullable: true }, seiten: { type: 'integer', nullable: true }, zeit: { ...zeit, nullable: true } } },
      version: { type: 'integer', description: 'Nummer der aktuellen Version (ohne Versionierung 1)' },
      herkunft: { type: 'string', nullable: true, enum: [...Object.keys(HERKUNFT), null], description: 'Woher die aktuelle Version kam' },
      archivnummer: { type: 'string', nullable: true, description: 'Archivnummer des Papieroriginals (#345)' },
      aeltere: { type: 'integer', description: 'Anzahl älterer Versionen' },
    },
  },
  DokumentVersion: {
    type: 'object', description: 'Eine ältere Version eines Dokuments',
    properties: {
      dokumentId: uuid, nummer: { type: 'integer' }, name: { type: 'string' }, mime: { type: 'string' }, groesse: { type: 'integer' }, sha256: { type: 'string' }, anzeigbar: { type: 'boolean' },
      erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, herkunft: { type: 'string', nullable: true },
    },
  },
  Versionen: { type: 'object', properties: { aktuell: ref('Dokument'), aeltere: { type: 'array', items: ref('DokumentVersion'), description: 'neueste zuerst' } } },
  MappeDetails: {
    type: 'object',
    properties: {
      mappe: ref('Mappe'), favorit: { type: 'boolean', description: 'Favorit des Benutzers dieses Schlüssels' }, dokumente: liste('Dokument'), notizen: liste('Notiz'), aufgaben: liste('Aufgabe'), bezuege: { type: 'object', additionalProperties: ref('Bezug') },
      rueckverweise: { type: 'array', items: { type: 'object', properties: { quelleId: uuid, quelleTypId: uuid, feldKey: { type: 'string' }, titel: { type: 'string' } } } },
      aufbewahrenBis: { type: 'string', format: 'date', nullable: true, description: 'Archivmodus (#212): Ende der Aufbewahrungsfrist (JJJJ-12-31); vorher antwortet Löschen mit 409' },
      loeschbar: { type: 'object', description: 'Ob die Mappe gelöscht werden kann; sonst Grund und die Mappen, die das verhindern', properties: { ok: { type: 'boolean' }, grund: { type: 'string' }, rueckverweise: { type: 'array', items: { type: 'object', properties: { quelleId: uuid, quelleTypId: uuid, feldKey: { type: 'string' }, titel: { type: 'string' } } } } } },
    },
  },
  Seite: {
    type: 'object',
    properties: {
      gesamt: { type: 'integer' }, von: { type: 'integer' }, mappen: liste('Mappe'), bezuege: { type: 'object', additionalProperties: ref('Bezug') },
      aufgaben: { type: 'object', description: 'Nur unter „Zu erledigen“: offene Aufgaben je Mappen-Id', additionalProperties: { type: 'string' } },
      favoriten: { type: 'array', items: uuid, description: 'Ids der gelieferten Mappen, die Favoriten des Benutzers sind' },
      ausschnitte: { type: 'object', description: 'Nur mit volltext=true: Fundstelle je Mappen-Id; Treffer zwischen den Steuerzeichen U+0002 und U+0003', additionalProperties: { type: 'object', properties: { dokument: { type: 'string' }, text: { type: 'string' } } } },
    },
  },
  Aufgabe: {
    type: 'object',
    properties: {
      id: uuid, mappeId: uuid, empfaengerId: { ...uuid, nullable: true, description: 'null = Administratoren' }, art: { type: 'string', enum: ['passung', 'erwaehnung', 'manuell', 'vertretung', 'frist', 'erinnerung', 'post', 'auskunft', 'aenderung'] },
      text: { type: 'string' }, feldKey: { type: 'string', nullable: true }, datum: { type: 'string', format: 'date', nullable: true, description: 'Frist und Erinnerung: das Datum, um das es geht' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true },
      erledigt: { ...zeit, nullable: true }, erledigtVon: { ...uuid, nullable: true }, mappeTitel: { type: 'string' }, typId: uuid,
    },
  },
  AufgabenListe: liste('Aufgabe'),
  AufgabeEingabe: { type: 'object', required: ['empfaengerId', 'text'], properties: { empfaengerId: uuid, text: { type: 'string' } } },
  Favorit: { type: 'object', properties: { favorit: { type: 'boolean' } } },
  Delegieren: { type: 'object', required: ['empfaengerId'], properties: { empfaengerId: uuid } },
  SammelAuswahl: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: uuid, maxItems: 1000 } } },
  SammelWeitergabe: { type: 'object', required: ['ids', 'empfaengerId'], properties: { ids: { type: 'array', items: uuid, maxItems: 1000 }, empfaengerId: uuid } },
  SammelErgebnis: { type: 'object', properties: { weitergegeben: { type: 'array', items: uuid, description: 'nur bei /aufgaben/weitergeben' }, erledigt: { type: 'array', items: uuid, description: 'nur bei /aufgaben/erledigt' }, nicht: { type: 'array', items: { type: 'object', properties: { id: uuid, grund: { type: 'string' } } } } } },
  Notiz: { type: 'object', properties: { id: uuid, mappeId: uuid, text: { type: 'string', description: 'Markdown' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, geaendert: zeit, geaendertVon: { ...uuid, nullable: true } } },
  NotizListe: liste('Notiz'),
  PostEingabe: { type: 'object', properties: {
    betreff: { type: 'string', description: 'Standard „Neue Post“' }, datum: { type: 'string', format: 'date' }, absender: { type: 'string', description: 'Wer die Post geschickt hat; ohne Angabe leer (bis 0.99: Name des Benutzers, #494)' },
    fuer: { ...uuid, description: 'Id eines Benutzers: Er bekommt die Aufgabe „Post für dich“ unter „Zu erledigen“, solange die Post neu ist.' }, nachricht: { type: 'string' },
    kanal: { type: 'string', enum: ['Hochgeladen', 'E-Mail', 'Scan', 'Ordner', 'Import', 'API', 'WebDAV'] },
    werte: { ...ref('Werte'), description: 'Werte weiterer Felder, die der Administrator am Typ Post ergänzt hat' },
  } },
  Zuordnen: { type: 'object', required: ['ziel'], properties: {
    ziel: { ...uuid, description: 'Id der Mappe, zu der die Post gehört' }, register: { type: 'string', description: 'Kennung eines Dokumentenregisters der Zielmappe; Standard: das erste' },
    dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten der Post; Standard: alle' }, kopieren: { type: 'boolean', description: 'true = Dokumente bleiben auch in der Post' },
  } },
  Zugeordnet: { type: 'object', properties: { post: ref('Mappe'), ziel: ref('Mappe') } },
  VorschlaegeEingabe: { type: 'object', properties: { text: { type: 'string', description: 'Text, z. B. von Fotos (höchstens 200.000 Zeichen)' }, dokumente: { type: 'array', items: uuid, description: 'Dokumente mit Volltext (höchstens 10)' }, mappe: { ...uuid, description: 'Mappe dieses Typs, die gefüllt wird' } } },
  TypVorschlaege: { type: 'object', properties: {
    vorschlaege: { type: 'object', additionalProperties: { type: 'object', properties: { wert: { description: 'Wert im Format der Feldart (wie Werte)' }, sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] }, fundstelle: { type: 'string' } } }, description: 'Je Feldkennung' },
    bezuege: { type: 'object', additionalProperties: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } }, description: 'Titel der vorgeschlagenen Mappen in Verweisfeldern' },
    neu: { type: 'object', additionalProperties: { type: 'object', properties: { typId: uuid, werte: { type: 'object', additionalProperties: { type: 'string' } }, fundstelle: { type: 'string' } } }, description: 'Verweisfeld ohne passende Mappe: Vorschlag, eine neue (z. B. Organisation) mit diesen Werten anzulegen' },
    verworfen: { type: 'integer', description: 'Werte, die die Prüfung gegen die Feldtypen verworfen hat' }, zeichen: { type: 'integer', description: 'Länge des gelesenen Texts' },
    text: { type: 'string', description: 'Nur bei /datei: der gelesene Text' }, info: { type: 'string', description: 'Nur bei /datei: wie gelesen wurde' },
  } },
  JsonSchema: { type: 'object', description: 'JSON Schema 2020-12', additionalProperties: true },
  Rueckgaengig: { type: 'object', properties: { post: ref('Mappe'), dokumente: { type: 'integer', description: 'Dokumente, die zurück in die Post kamen' } } },
  Erkennung: { type: 'object', properties: {
    zeit: { type: 'string', format: 'date-time' }, dokumente: { type: 'integer', description: 'Dokumente der Post mit Volltext' },
    absender: { type: 'array', items: { type: 'object', properties: { mappeId: uuid, typId: uuid, titel: { type: 'string' }, stark: { type: 'boolean', description: 'an einem eindeutigen Merkmal erkannt (Kundennummer, IBAN, E-Mail …)' }, punkte: { type: 'number' }, gruende: { type: 'array', items: { type: 'string' }, description: 'z. B. „Kundennummer 100-4711“' } } } },
    eindeutig: { ...uuid, nullable: true, description: 'Eindeutig erkannter Absender' },
    angaben: { type: 'object', properties: { datum: { type: 'object', nullable: true, properties: { wert: { type: 'string', format: 'date' }, sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] }, fundstelle: { type: 'string' } } }, betrag: { type: 'object', nullable: true, properties: { wert: { type: 'object', properties: { betrag: { type: 'number' }, waehrung: { type: 'string' } } }, sicherheit: { type: 'string' }, fundstelle: { type: 'string' } } }, nummern: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, wert: { type: 'string' }, fundstelle: { type: 'string' } } } } } },
    neuerAbsender: { type: 'object', nullable: true, properties: { typId: uuid, werte: { type: 'object', additionalProperties: { type: 'string' } }, fundstelle: { type: 'string' } } },
    ziele: { type: 'array', items: { type: 'object', properties: { mappeId: uuid, typId: uuid, titel: { type: 'string' }, punkte: { type: 'number' }, gruende: { type: 'array', items: { type: 'string' } } } } },
  } },
  FotoAbgelegt: { type: 'object', properties: { id: { ...uuid, description: 'Kennung des Fotos im Stapel' } } },
  PostFotos: { type: 'object', required: ['stapel'], properties: { stapel: { type: 'array', items: uuid, description: 'Kennungen aus POST /fotostapel, höchstens 50' }, betreff: { type: 'string' }, fuer: uuid } },
  FotosAnhaengen: { type: 'object', required: ['stapel'], properties: { stapel: { type: 'array', items: uuid }, dokument: { ...uuid, description: 'PDF der Mappe, an das die Seiten kommen' }, register: { type: 'string' } } },
  FotosAngehaengt: { type: 'object', properties: { dokument: ref('Dokument'), seiten: { type: 'integer' } } },
  Zusammenlegen: { type: 'object', required: ['quelle'], properties: { quelle: { ...uuid, description: 'Id der Post, deren Seiten angehängt werden' } } },
  PostAusFotos: { type: 'object', properties: { post: ref('Mappe'), dokument: ref('Dokument'), seiten: { type: 'integer' } } },
  EmailEingabe: { type: 'object', required: ['an', 'betreff'], properties: { an: { type: 'string', description: 'Eine oder mehrere Adressen, durch Komma getrennt' }, betreff: { type: 'string' }, nachricht: { type: 'string' }, dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten dieser Mappe' } } },
  EmailVersendet: { type: 'object', properties: { id: { ...uuid, description: 'Id der neuen E-Mail-Mappe' }, typId: uuid } },
  NotizEingabe: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  Erinnerung: { type: 'object', properties: { id: uuid, mappeId: uuid, empfaengerId: { ...uuid, nullable: true }, datum: { type: 'string', format: 'date' }, text: { type: 'string' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, hinweis: { type: 'string', description: 'Wenn der Empfänger die Mappe nicht lesen darf' } } },
  ErinnerungEingabe: { type: 'object', required: ['datum', 'text'], properties: { datum: { type: 'string', format: 'date' }, text: { type: 'string' }, empfaengerId: { ...uuid, description: 'Benutzer; fehlt = der Benutzer des Schlüssels' } } },
  Anstehend: { type: 'object', properties: { tage: { type: 'integer' }, eintraege: { type: 'array', items: { type: 'object', properties: {
    art: { type: 'string', enum: ['frist', 'erinnerung'] }, datum: { type: 'string', format: 'date' }, ab: { type: 'string', format: 'date', description: 'ab wann unter „Zu erledigen“' }, text: { type: 'string' },
    mappeId: uuid, mappeTitel: { type: 'string' }, typId: uuid, faellig: { type: 'boolean', description: 'steht schon unter „Zu erledigen“' }, feldKey: { type: 'string', nullable: true }, erinnerungId: uuid,
  } } } } },
  Historie: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, mappeId: uuid, zeit: zeit, benutzerId: { ...uuid, nullable: true }, art: { type: 'string' }, daten: { type: 'object', additionalProperties: true, description: 'Je nach Art, z. B. aenderungen: [{feld, label, alt, neu}] oder dokument' } } } },
  StempelVorlagen: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, text: { type: 'string' }, lage: { type: 'string', enum: ['diagonal', 'kopf', 'fuss', 'ecke'] }, deckkraft: { type: 'number' }, seiten: { type: 'string', enum: ['alle', 'erste'] }, seitenzahlen: { type: 'boolean' }, archivnummer: { type: 'boolean' } } } },
  Volltext: { type: 'object', properties: { id: uuid, name: { type: 'string' }, ocr: { type: 'object' }, text: { type: 'string', nullable: true } } },
  Sicht: {
    type: 'object',
    properties: {
      id: uuid, name: { type: 'string' }, beschreibung: { type: 'string' }, elternId: { ...uuid, nullable: true }, position: { type: 'integer' },
      typen: { type: 'array', items: uuid, description: 'Mappentypen, deren Mappen die Ansicht selbst zeigt; dazu kommen die ihrer Unteransichten' },
      bedingungen: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Gelten zusammen (UND): {art:"feld", feld, op, wert?, bis?}, {art:"dokumente"|"verknuepfungen", register, vergleich, anzahl}, {art:"dokumenteGesamt"|"verknuepfungenGesamt", vergleich, anzahl}, {art:"favorit"}' },
      trefferliste: { type: 'string', nullable: true, description: 'Kennung der Trefferliste; null = Standard' },
      rechte: { type: 'object', readOnly: true, properties: { R: { type: 'boolean' }, C: { type: 'boolean' } }, description: 'Nur für Benutzer (#148): wirksame Rechte an der Ansicht. Verborgene Ansichten fehlen in der Liste.' },
    },
  },
  SichtListe: liste('Sicht'),
  Zaehler: { type: 'object', properties: { sichten: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Anzahl Mappen je Ansicht (mit Unteransichten)' }, typen: { type: 'object', additionalProperties: { type: 'object', properties: { anzahl: { type: 'integer' }, unpassend: { type: 'integer' }, demo: { type: 'integer' } } } }, eingang: { type: 'integer' }, favoriten: { type: 'integer', description: 'Eigene Favoriten' } } },
  SchwaerzenAnalyse: { type: 'object', properties: { id: uuid, name: { type: 'string' }, mime: { type: 'string' }, sha256: { type: 'string' },
    seiten: { type: 'array', items: { type: 'object', properties: { breite: { type: 'number', description: 'pt, wie angezeigt' }, hoehe: { type: 'number' }, woerter: { type: 'array', description: '[Text, x, y, b, h], relativ zur Seite', items: { type: 'array', items: {} } } } } },
    quelle: { type: 'string', enum: ['textebene', 'texterkennung', 'gemischt', 'keine'] }, erkannt: { type: 'integer', description: 'Seiten per Texterkennung' },
    versioniert: { type: 'boolean' }, kopieName: { type: 'string' }, muster: { type: 'object', additionalProperties: { type: 'string' } } } },
  Schwaerzen: { type: 'object', properties: {
    bereiche: { type: 'array', maxItems: 5000, items: { type: 'object', required: ['seite', 'x', 'y', 'b', 'h'], properties: { seite: { type: 'integer', minimum: 1 }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, b: { type: 'number', minimum: 0, maximum: 1 }, h: { type: 'number', minimum: 0, maximum: 1 } } } },
    begriffe: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 200 }, description: 'Überall schwärzen, z. B. ein Name oder eine IBAN' },
    muster: { type: 'array', items: { type: 'string', enum: ['iban', 'steuerid', 'geburtsdatum', 'email', 'telefon'] }, description: 'Alle Fundstellen dieser Muster schwärzen' },
    ziel: { type: 'string', enum: ['kopie', 'version'], description: 'Standard: kopie' } } },
  Geschwaerzt: { type: 'object', properties: { dokument: ref('Dokument'), ziel: { type: 'string' }, stellen: { type: 'integer' }, seiten: { type: 'integer', description: 'betroffene Seiten' },
    begriffe: { type: 'array', items: { type: 'object', properties: { gefunden: { type: 'integer' } } }, description: 'je Suchbegriff (in der Reihenfolge der Eingabe, ohne doppelte und leere)' }, meldung: { type: 'string' } } },
  VerkleinernSchaetzung: { type: 'object', properties: { id: uuid, name: { type: 'string' }, groesse: { type: 'integer' }, seiten: { type: 'integer' }, bilder: { type: 'integer' }, hoechsteDpi: { type: 'integer', nullable: true }, versioniert: { type: 'boolean' }, papierkorb: { type: 'boolean' }, mindestens: { type: 'number', description: 'Mindestersparnis (0.1)' },
    stufen: { type: 'object', description: 'je Stufe (bildschirm, standard, druck)', additionalProperties: { type: 'object', properties: { dpi: { type: 'integer' }, geschaetzt: { type: 'integer' }, lohnt: { type: 'boolean' }, bilder: { type: 'integer', description: 'Bilder, die neu gerechnet würden' } } } } } },
  Verkleinern: { type: 'object', properties: { stufe: { type: 'string', enum: ['bildschirm', 'standard', 'druck'], description: 'Standard: standard' }, bestaetigt: { type: 'boolean', description: 'Nötig ohne Versionierung' } } },
  Verkleinert: { type: 'object', properties: { dokument: ref('Dokument'), unveraendert: { type: 'boolean' }, vorher: { type: 'integer' }, nachher: { type: 'integer' }, stufe: { type: 'string' }, meldung: { type: 'string', description: 'z. B. „Verkleinert von 18,4 MB auf 2,1 MB (−89 %).“' } } },
  BaumKnoten: { type: 'object', properties: {
    id: uuid, typId: uuid, typ: { type: 'string' }, titel: { type: 'string' }, ebene: { type: 'integer', description: '0 = Start-Mappe' },
    ueber: { type: 'object', nullable: true, description: 'über welchen Verweis erreicht', properties: { vonId: uuid, richtung: { type: 'string', enum: ['verwiesenVon', 'verweistAuf'] }, feldKey: { type: 'string' }, feld: { type: 'string' }, verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] } } },
    nurBezug: { type: 'boolean', description: 'mit nurZugehoerigkeit: nur über Bezug verbunden – Blatt, nicht weiterverfolgt' },
    auchUeber: { type: 'array', description: 'weitere Wege innerhalb des Baums (Kreise)', items: { type: 'object' } },
    dokumente: { type: 'integer' },
    aussen: { type: 'object', description: 'Verweise zu Mappen außerhalb des Baums (je Richtung höchstens 20 einzeln, anzahl zählt alle); nicht lesbare ohne Titel', properties: { verweistAuf: { type: 'array', items: { type: 'object' } }, verwiesenVon: { type: 'array', items: { type: 'object' } }, anzahl: { type: 'object' } } },
    aufbewahrenBis: { type: 'string', format: 'date', nullable: true }, gesperrt: { type: 'boolean', description: 'in der Aufbewahrungsfrist (#212)' },
    rechte: { type: 'object', description: 'C, R, U, D, P des Aufrufers' },
  } },
  Baum: { type: 'object', properties: { startId: uuid, optionen: { type: 'object' }, knoten: { type: 'array', items: ref('BaumKnoten') }, abgeschnitten: { type: 'boolean' }, kreise: { type: 'integer' }, verborgen: { type: 'integer' }, tieferMoeglich: { type: 'boolean' } } },
  Datenschutz: { type: 'object', properties: { verantwortlicher: { type: 'string' }, empfaenger: { type: 'string' }, rechte: { type: 'string', description: 'Text auf dem Deckblatt; leer oder unverändert = Vorschlag in der eingestellten Anrede' }, anrede: { type: 'string', enum: ['du', 'sie'], description: 'Anrede in Unterlagen für Dritte (#474): Deckblatt, Übersicht, LIESMICH, Abrufseite, E-Mails an die Person. Vorgabe du; die Oberfläche bleibt bei du.' }, typen: { type: 'object', description: 'Typ-Id → { person: boolean, zweck: string }', additionalProperties: { type: 'object', properties: { person: { type: 'boolean' }, zweck: { type: 'string' } } } } } },
  AuskunftStand: { type: 'object', properties: { id: uuid, name: { type: 'string' }, mappeId: uuid, titel: { type: 'string' }, erstellt: zeit, bis: zeit, bytes: { type: 'integer' }, mappen: { type: 'integer' }, dokumente: { type: 'integer' }, verschluesselt: { type: 'boolean' }, von: { type: 'string' } } },
  DatenschutzStand: { type: 'object', properties: { einstellung: ref('Datenschutz'), auskuenfte: { type: 'array', items: ref('AuskunftStand') }, tage: { type: 'integer' },
    links: { type: 'array', items: ref('AuskunftLink'), description: 'Abruf-Links (#455), neueste zuerst – auch nach dem Löschen der ZIP als Nachweis' },
    adresse: { type: 'string', description: 'Adresse des DMS für Links' }, oeffentlich: { type: 'boolean', description: 'Adresse sieht nach Internet aus (nicht localhost, kein privates Netz) – Vorschlag: Abruf-Link' }, mail: { type: 'boolean', description: 'E-Mail-Versand eingerichtet' } } },
  LoeschEintrag: { type: 'object', description: 'Ein Schritt einer Löschung (#470) – ohne Titel, Feldwerte und Dateinamen', properties: {
    id: uuid, zeit, art: { type: 'string', enum: ['mappe', 'dokument'] }, schritt: { type: 'string', enum: ['papierkorb', 'endgueltig', 'wiederhergestellt'] },
    weg: { type: 'string', description: 'einzeln, mehrere, verknuepft, dokument, ersetzt, version, papierkorb, leeren, abmelden, ablauf, ausgeschaltet, zurueckgerollt' },
    mappeId: uuid, typId: { ...uuid, nullable: true }, typ: { type: 'string', description: 'Name des Mappentyps beim Löschen' }, nummer: { type: 'string', nullable: true, description: 'Nummer aus dem Nummernkreis der Mappe' },
    archivnummer: { type: 'string', nullable: true }, dokumentId: { ...uuid, nullable: true }, version: { type: 'integer', nullable: true }, sha256: { type: 'string', nullable: true },
    groesse: { type: 'integer', nullable: true }, mime: { type: 'string', nullable: true }, seiten: { type: 'integer', nullable: true },
    anzahl: { type: 'object', nullable: true, properties: { dokumente: { type: 'integer' }, versionen: { type: 'integer' }, notizen: { type: 'integer' }, verweise: { type: 'integer' } } },
    vonId: { ...uuid, nullable: true }, von: { type: 'string' }, ausloeser: { type: 'string', enum: ['benutzer', 'api', 'paket', 'automatisch'] },
    grund: { type: 'string', nullable: true, enum: ['frist', 'verlangen', 'nicht_noetig', 'sonstiges'] }, grundText: { type: 'string' }, vorgang: { ...uuid, nullable: true }, startId: { ...uuid, nullable: true } } },
  Loeschprotokoll: { type: 'object', properties: { eintraege: { type: 'array', items: ref('LoeschEintrag') }, gesamt: { type: 'integer' }, jahre: { type: 'integer', description: 'Aufbewahrung in Jahren' }, max: { type: 'integer' } } },
  LoeschprotokollEinstellung: { type: 'object', properties: { jahre: { type: 'integer', minimum: 1, maximum: 30 } } },
  AuskunftLink: { type: 'object', properties: { id: uuid, auskunftId: uuid, mappeId: uuid, titel: { type: 'string' }, empfaenger: { type: 'string', nullable: true }, codeArt: { type: 'string', enum: ['erzeugt', 'eigen'] },
    erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, ablauf: zeit, maxAbrufe: { type: 'integer' }, abrufe: { type: 'integer' }, fehlversuche: { type: 'integer' },
    gesperrt: { ...zeit, nullable: true, description: 'nach zu vielen falschen Abrufcodes' }, widerrufen: { ...zeit, nullable: true }, abgerufen: { ...zeit, nullable: true, description: 'zuletzt erfolgreich abgerufen' } } },
  AuskunftLinkEingabe: { type: 'object', properties: { tage: { type: 'integer', description: '1–90, Standard 30' }, abrufe: { type: 'integer', description: '1–10, Standard 3' }, code: { type: 'string', description: 'eigener Abrufcode (z. B. Vertragsnummer, mindestens 6 Zeichen); ohne Angabe erzeugt das DMS einen' }, an: { type: 'string', format: 'email' }, senden: { type: 'boolean', description: 'Link per E-Mail an „an“ schicken (ohne Code)' } } },
  AuskunftLinkNeu: { type: 'object', properties: { link: ref('AuskunftLink'), url: { type: 'string', description: 'nur jetzt im Klartext' }, code: { type: 'string', description: 'Abrufcode, nur jetzt im Klartext – auf anderem Weg mitteilen' }, gesendet: { type: 'boolean' } } },
  AuskunftEmail: { type: 'object', required: ['an'], properties: { an: { type: 'string', description: 'Adressen, durch Komma getrennt' }, betreff: { type: 'string' }, nachricht: { type: 'string' } } },
  AuskunftEmailErgebnis: { type: 'object', properties: { an: { type: 'array', items: { type: 'string' } } } },
  AuskunftVorschauEingabe: { type: 'object', required: ['mappeId'], properties: { mappeId: uuid, tiefe: { type: 'integer' }, richtungen: { type: 'array', items: { type: 'string' } } } },
  AuskunftVorschau: { type: 'object', properties: { baum: ref('Baum'), mappen: { type: 'object', description: 'Mappe-Id → { dokumente, notizen, historie, dritte, ohneFelder } (auch für Bezug-Mappen, falls man sie ganz aufnimmt)' }, frist: { type: 'string', format: 'date' } } },
  AuskunftEingabe: { type: 'object', required: ['mappeId', 'auswahl', 'geprueft'], properties: {
    mappeId: uuid, tiefe: { type: 'integer' }, richtungen: { type: 'array', items: { type: 'string' } },
    auswahl: { type: 'object', properties: { mappen: { type: 'array', items: uuid }, dokumente: { type: 'array', items: uuid }, notizen: { type: 'array', items: uuid }, historie: { type: 'array', items: uuid, description: 'Mappen, deren Historie mitgeht' }, ohneNotizen: { type: 'array', items: { type: 'object', properties: { id: uuid, grund: { type: 'string' } } } }, erwaehnungen: { type: 'array', items: uuid, description: 'Bezug-Mappen (nurBezug), die nur mit Art, Titel und Feld hinausgehen – ohne Dokumente, Notizen und übrige Werte (#472); ganz aufgenommene stehen in mappen' } } },
    geprueft: { type: 'boolean' }, passwort: { type: 'string' }, empfaenger: { type: 'string' }, anmerkung: { type: 'string' },
  } },
  AuskunftFrist: { type: 'object', required: ['mappeId'], properties: { mappeId: uuid, eingang: { type: 'string', format: 'date', description: 'Eingang der Anfrage (Standard heute)' } } },
  Auftrag: { type: 'object', description: 'Hintergrundauftrag (#364)', properties: { id: uuid, art: { type: 'string' }, titel: { type: 'string' }, status: { type: 'string', enum: ['laeuft', 'fertig', 'fehler'] }, fertig: { type: 'integer' }, gesamt: { type: 'integer' }, phase: { type: 'string', nullable: true }, phasen: { type: 'array', items: { type: 'object' } }, gestartet: zeit, beendet: zeit, ergebnis: { type: 'object' }, fehler: { type: 'string' } } },
  VerkleinernViele: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: uuid }, stufe: { type: 'string', enum: ['bildschirm', 'standard', 'druck'] }, ohneOriginal: { type: 'boolean' }, bestaetigt: { type: 'boolean' } } },
  GrossePdfs: { type: 'object', properties: { stufe: { type: 'string' }, ab: { type: 'number' }, geschaetzteErsparnis: { type: 'integer' }, mehr: { type: 'boolean' }, eintraege: { type: 'array', items: { type: 'object', properties: { id: uuid, name: { type: 'string' }, groesse: { type: 'integer' }, mappeId: uuid, mappeTitel: { type: 'string' }, version: { type: 'integer' }, geschaetzt: { type: 'integer', nullable: true }, lohnt: { type: 'boolean', nullable: true } } } } } },
  Seiten: { type: 'object', properties: { id: uuid, name: { type: 'string' }, version: { type: 'integer' }, sha256: { type: 'string' }, anzahl: { type: 'integer' }, drehungen: { type: 'array', items: { type: 'integer', enum: [0, 90, 180, 270] } }, bilderBis: { type: 'integer', description: 'Seitenbilder gibt es bis zu dieser Seite' } } },
  SeitenBearbeiten: { type: 'object', required: ['seiten'], properties: {
    seiten: { type: 'array', minItems: 1, items: { type: 'object', required: ['nr'], properties: { nr: { type: 'integer', minimum: 1 }, drehung: { type: 'integer', enum: [0, 90, 180, 270] } } } },
    teile: { type: 'array', items: { type: 'integer', minimum: 0 }, description: 'Positionen in seiten, an denen ein neuer Teil beginnt' },
    bestaetigt: { type: 'boolean', description: 'Ersetzen ohne Versionierung bestätigen' },
  } },
  SeitenErgebnis: { type: 'object', properties: { dokumente: { type: 'array', items: ref('Dokument') }, posten: { type: 'array', items: ref('Mappe'), description: 'Neue Posts beim Teilen einer Post' } } },
  Zusammenfuegen: { type: 'object', required: ['dokumente'], properties: {
    dokumente: { type: 'array', minItems: 2, maxItems: 100, items: uuid }, ziel: uuid, register: { type: 'string' }, name: { type: 'string' },
    originaleEntfernen: { type: 'boolean' }, bestaetigt: { type: 'boolean' },
  } },
  Zusammengefuegt: { type: 'object', properties: { dokument: ref('Dokument'), erledigtePost: { type: 'array', items: uuid } } },
  EmailMehrere: { type: 'object', required: ['ids', 'an', 'betreff'], properties: {
    ids: { type: 'array', minItems: 1, maxItems: 100, items: uuid }, an: { type: 'string', description: 'Empfänger, mehrere durch Komma getrennt (höchstens 20)' },
    betreff: { type: 'string', maxLength: 250 }, nachricht: { type: 'string' }, angaben: { type: 'boolean', description: 'Angaben je Mappe als PDF (Standard: ja)' },
    dokumente: { oneOf: [{ type: 'string', enum: ['alle'] }, { type: 'array', items: uuid }] },
  } },
  EmailMehrereVersendet: { type: 'object', properties: { id: { ...uuid, description: 'Id der Post' }, typId: uuid, mappen: { type: 'integer' }, anhaenge: { type: 'integer' } } },
  Archivnummer: { type: 'object', properties: { archivnummer: { type: 'string', nullable: true, maxLength: 40, description: 'leer oder null entfernt die Nummer' } } },
  ArchivnummerTreffer: { type: 'object', properties: { dokument: ref('Dokument'), mappeId: uuid, typId: uuid, titel: { type: 'string' } } },
  VolltextSchreiben: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'höchstens 5 000 000 Zeichen' }, seiten: { type: 'integer', minimum: 1 } } },
  Gleiche: { type: 'object', required: ['pruefwerte'], properties: { pruefwerte: { type: 'array', maxItems: 100, items: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, ohneMappe: uuid } },
  Fundstellen: { type: 'object', properties: { fundstellen: { type: 'object', description: 'Je Prüfwert höchstens 5 Fundstellen', additionalProperties: { type: 'array', items: { type: 'object', properties: { mappeId: uuid, typId: uuid, titel: { type: 'string' }, typ: { type: 'string' }, register: { type: 'string' }, name: { type: 'string' }, erstellt: { type: 'string', format: 'date-time' } } } } } } },
  PapierkorbDokumente: { type: 'array', items: { type: 'object', properties: { id: uuid, art: { type: 'string', enum: ['dokument'] }, mappeId: uuid, typId: uuid, mappeTitel: { type: 'string' }, registerKey: { type: 'string' }, register: { type: 'string' }, name: { type: 'string' }, mime: { type: 'string' }, groesse: { type: 'integer' }, sha256: { type: 'string' }, versionen: { type: 'integer', description: 'ältere Versionen, die mitgegangen sind' }, erstellt: { type: 'string', format: 'date-time' }, erstelltVon: { type: 'string', nullable: true }, geloescht: { type: 'string', format: 'date-time' }, geloeschtVon: { type: 'string', nullable: true }, mappe: { type: 'string', enum: ['da', 'papierkorb', 'weg'] } } } },
  DokumentWiederhergestellt: { type: 'object', properties: { dokument: ref('Dokument'), typId: uuid } },
  Hochgeladen: { type: 'object', properties: { dokument: ref('Dokument'), gleicherInhalt: { type: 'array', items: { type: 'object', properties: { mappeId: uuid, name: { type: 'string' }, titel: { type: 'string' }, typId: uuid } } } } },
  Benutzer: {
    type: 'object',
    properties: { id: uuid, email: { type: 'string', format: 'email' }, name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, aktiv: { type: 'boolean' }, hatPasswort: { type: 'boolean' }, erstellt: zeit, letzteAnmeldung: { ...zeit, nullable: true }, rollen: weitereRollen },
  },
  BenutzerListe: liste('Benutzer'),
  BenutzerEingabe: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' }, name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, rollen: weitereRollen } },
  BenutzerAenderung: { type: 'object', properties: { name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, aktiv: { type: 'boolean' }, rollen: weitereRollen } },
  RollenListe: { type: 'array', items: { type: 'object', properties: { id: uuid, name: { type: 'string' }, system: { type: 'boolean', description: 'Administrator oder Mitglied' } } } },
  LinkErgebnis: { type: 'object', properties: { benutzer: ref('Benutzer'), mailVerschickt: { type: 'boolean' }, link: { type: 'string', description: 'Nur ohne E-Mail-Versand' } } },
  ZusammenfassungEingabe: { type: 'object', properties: { aktiv: { type: 'boolean' }, uhrzeit: { type: 'string', nullable: true, example: '07:00' }, tage: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } }, feiertage: { type: 'boolean' } } },
  Zusammenfassung: { type: 'object', properties: { aktiv: { type: 'boolean' }, uhrzeit: { type: 'string', nullable: true }, tage: { type: 'array', items: { type: 'integer' } }, feiertage: { type: 'boolean' },
    standard: { type: 'object', properties: { uhrzeit: { type: 'string' }, tage: { type: 'array', items: { type: 'integer' } }, bundesland: { type: 'string', nullable: true } } }, versand: { type: 'boolean' } } },
  Abwesenheit: { type: 'object', required: ['an'], properties: { an: { type: 'boolean' }, von: { type: 'string', format: 'date', nullable: true }, bis: { type: 'string', format: 'date', nullable: true }, vertreterId: { ...uuid, nullable: true } } },
  AbwesenheitStand: { type: 'object', properties: { abwesenheit: { ...ref('Abwesenheit'), nullable: true }, offeneAufgaben: { type: 'integer' } } },
  Ich: { type: 'object', properties: { benutzer: ref('Benutzer'), schluessel: { type: 'object', nullable: true, properties: { name: { type: 'string' }, recht: { type: 'string', enum: ['lesen', 'schreiben'] }, passwoerter: { type: 'boolean', description: 'Recht „Passwörter lesen“' }, ablauf: { ...zeit, nullable: true } } } } },
};

const inhalt = (s: string | 'binaer') => (s === 'binaer'
  ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
  : { 'application/json': { schema: ref(s) } });

export function openapi(version: string, serverUrl?: string): Schema {
  const paths: Record<string, Record<string, Schema>> = {};
  for (const e of V1_TABELLE) {
    const fehler: Record<string, Schema> = {
      401: { description: 'Nicht angemeldet oder Schlüssel ungültig', content: inhalt('Fehler') },
      403: { description: e.gruppe === 'Werkbank' ? 'Nur für Administratoren; oder Schlüssel nur zum Lesen' : 'Schlüssel nur zum Lesen', content: inhalt('Fehler') },
    };
    if (e.parameter?.some((p) => p.wo === 'path')) fehler[404] = { description: 'Nicht gefunden', content: inhalt('Fehler') };
    if (e.body && e.body !== 'binaer') fehler[422] = { description: 'Eingaben ungültig (details: Prüfergebnis)', content: inhalt('Fehler') };
    if (e.methode === 'DELETE') fehler[409] = { description: 'Kann (noch) nicht gelöscht werden', content: inhalt('Fehler') };
    const status = String(e.status ?? 200);
    (paths[e.pfad] ??= {})[e.methode.toLowerCase()] = {
      tags: [e.gruppe],
      summary: e.zusammenfassung,
      ...(e.beschreibung ? { description: e.beschreibung } : {}),
      operationId: `${e.methode.toLowerCase()}${e.pfad.replace(/\{(\w+)\}/g, 'Mit$1').replace(/(^|\/)(\w)/g, (_, _s, c: string) => c.toUpperCase())}`,
      ...(e.parameter ? { parameters: e.parameter.map((p) => ({ name: p.name, in: p.wo, required: !!p.pflicht, description: p.beschreibung, schema: { type: p.typ } })) } : {}),
      ...(e.body ? { requestBody: { required: true, content: inhalt(e.body) } } : {}),
      responses: {
        [status]: e.antwort === null ? { description: 'Erledigt' } : { description: 'Erfolg', ...(e.antwort ? { content: inhalt(e.antwort) } : {}) },
        ...fehler,
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'DMS API',
      version,
      description: 'Schnittstelle des selbst gehosteten DMS. Anmeldung mit einem API-Schlüssel aus dem Profil: `Authorization: Bearer dms_…`. Ein Schlüssel hat höchstens die Rechte seines Benutzers; Schlüssel „nur lesen“ erlauben nur GET. Diese Beschreibung entsteht aus der installierten Version.',
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    servers: [{ url: `${serverUrl?.replace(/\/$/, '') ?? ''}/api/v1` }],
    security: [{ apiSchluessel: [] }],
    tags: [
      { name: 'Konto', description: 'Wer ist angemeldet' }, { name: 'Ablage', description: 'Mappentypen lesen, Mappen anlegen, lesen, ändern, löschen' },
      { name: 'Dokumente', description: 'Dateien an Mappen' }, { name: 'Werkbank', description: 'Nur mit dem Schlüssel eines Administrators' },
    ],
    paths,
    components: {
      securitySchemes: { apiSchluessel: { type: 'http', scheme: 'bearer', bearerFormat: 'dms_…', description: 'API-Schlüssel aus dem Profil' } },
      schemas: SCHEMAS,
    },
  };
}

/** Für Protokoll und Anzeige: wer über welchen Schlüssel fragt. */
export const wer = (b: Benutzer | undefined, schluessel?: { name: string }) => (b ? (schluessel ? `${b.email} (API: ${schluessel.name})` : b.email) : undefined);
