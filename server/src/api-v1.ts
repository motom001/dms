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
  { methode: 'DELETE', pfad: '/mappen/{id}/favorit', gruppe: 'Ablage', zusammenfassung: 'Favorit entfernen', intern: { methode: 'DELETE', pfad: '/api/mappen/:id/favorit' }, parameter: [id('der Mappe')], antwort: 'Favorit' },
  { methode: 'GET', pfad: '/papierkorb', gruppe: 'Ablage', zusammenfassung: 'Eigener Papierkorb', beschreibung: 'Mappen, die der Benutzer dieses Schlüssels gelöscht hat, neueste zuerst. Nach der eingestellten Aufbewahrung werden sie endgültig gelöscht.', intern: { methode: 'GET', pfad: '/api/papierkorb' }, antwort: 'PapierkorbListe' },
  { methode: 'POST', pfad: '/papierkorb/{id}/wiederherstellen', gruppe: 'Ablage', zusammenfassung: 'Mappe aus dem Papierkorb wiederherstellen', beschreibung: 'Verweise auf Mappen, die es nicht mehr gibt, entfallen; passt die Mappe danach nicht zur Definition (z. B. ein eindeutiger Wert ist inzwischen vergeben), erscheint sie unter „Zu erledigen“.', intern: { methode: 'POST', pfad: '/api/papierkorb/:id/wiederherstellen' }, parameter: [id('der Mappe')], antwort: 'Wiederhergestellt' },
  { methode: 'DELETE', pfad: '/papierkorb/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe endgültig löschen', intern: { methode: 'DELETE', pfad: '/api/papierkorb/:id' }, parameter: [id('der Mappe')], antwort: 'Geloescht' },
  { methode: 'GET', pfad: '/papierkorb/dokumente', gruppe: 'Ablage', zusammenfassung: 'Einzeln gelöschte Dokumente im eigenen Papierkorb', beschreibung: 'Dokumente, die der Benutzer dieses Schlüssels aus einem Register gelöscht hat (#344), neueste zuerst. mappe: da (wiederherstellbar), papierkorb (erst die Mappe wiederherstellen) oder weg.', intern: { methode: 'GET', pfad: '/api/papierkorb/dokumente' }, antwort: 'PapierkorbDokumente' },
  { methode: 'POST', pfad: '/papierkorb/dokumente/{id}/wiederherstellen', gruppe: 'Ablage', zusammenfassung: 'Dokument aus dem Papierkorb wiederherstellen', beschreibung: 'Legt das Dokument mit allen Versionen in dasselbe Register derselben Mappe zurück; braucht das Recht „Bearbeiten“ an der Mappe. 409, wenn die Mappe selbst im Papierkorb liegt oder es sie nicht mehr gibt.', intern: { methode: 'POST', pfad: '/api/papierkorb/dokumente/:id/wiederherstellen' }, parameter: [id('des Dokuments')], antwort: 'DokumentWiederhergestellt' },
  { methode: 'DELETE', pfad: '/papierkorb/dokumente/{id}', gruppe: 'Ablage', zusammenfassung: 'Dokument endgültig löschen', intern: { methode: 'DELETE', pfad: '/api/papierkorb/dokumente/:id' }, parameter: [id('des Dokuments')], antwort: 'Geloescht' },
  { methode: 'DELETE', pfad: '/papierkorb', gruppe: 'Ablage', zusammenfassung: 'Eigenen Papierkorb leeren', intern: { methode: 'DELETE', pfad: '/api/papierkorb' }, antwort: 'Geloescht' },
  { methode: 'GET', pfad: '/aufgaben', gruppe: 'Ablage', zusammenfassung: 'Meine offenen Aufgaben', beschreibung: 'Aufgaben für den Benutzer des Schlüssels (Administratoren: auch die für alle Administratoren), mit Titel und Typ der Mappe.', intern: { methode: 'GET', pfad: '/api/aufgaben' }, antwort: 'AufgabenListe' },
  { methode: 'POST', pfad: '/mappen/{id}/aufgaben', gruppe: 'Ablage', zusammenfassung: 'Aufgabe vergeben', intern: { methode: 'POST', pfad: '/api/mappen/:id/aufgaben' }, parameter: [id('der Mappe')], body: 'AufgabeEingabe', antwort: 'Aufgabe', status: 201 },
  { methode: 'POST', pfad: '/aufgaben/{id}/erledigt', gruppe: 'Ablage', zusammenfassung: 'Aufgabe erledigen', beschreibung: '„Passt nicht“-Aufgaben erledigen sich selbst (409).', intern: { methode: 'POST', pfad: '/api/aufgaben/:id/erledigt' }, parameter: [id('der Aufgabe')], antwort: 'Aufgabe' },
  { methode: 'POST', pfad: '/aufgaben/{id}/delegieren', gruppe: 'Ablage', zusammenfassung: 'Aufgabe weitergeben', intern: { methode: 'POST', pfad: '/api/aufgaben/:id/delegieren' }, parameter: [id('der Aufgabe')], body: 'Delegieren', antwort: 'Aufgabe' },
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
  { methode: 'POST', pfad: '/mappen', gruppe: 'Ablage', zusammenfassung: 'Mappe anlegen', beschreibung: 'Die Werte werden wie in der Oberfläche geprüft (Pflichtfelder, Längen, eindeutige Werte, Verweise). Bei Fehlern: 422 mit `details` je Feld.', intern: { methode: 'POST', pfad: '/api/mappen' }, body: 'MappeEingabe', antwort: 'Mappe', status: 201 },
  { methode: 'PUT', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe ändern', beschreibung: 'Übergebene Werte ersetzen die bisherigen; Werte von Feldern, die es im Typ nicht mehr gibt, bleiben erhalten.', intern: { methode: 'PUT', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], body: 'MappeAenderung', antwort: 'Mappe' },
  { methode: 'DELETE', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe löschen', beschreibung: 'Samt ihrer Dokumente. 409, solange andere Mappen auf sie verweisen. Ist der Papierkorb an, kommt sie dorthin und lässt sich wiederherstellen.', intern: { methode: 'DELETE', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], antwort: null, status: 204 },

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
  { methode: 'GET', pfad: '/dokumente/{id}/versionen/{nummer}/inhalt', gruppe: 'Dokumente', zusammenfassung: 'Ältere Version herunterladen', intern: { methode: 'GET', pfad: '/api/dokumente/:id/versionen/:nummer/inhalt' }, parameter: [id('des Dokuments'), { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' }], antwort: 'binaer' },
  { methode: 'POST', pfad: '/dokumente/{id}/versionen/{nummer}/zurueckholen', gruppe: 'Dokumente', zusammenfassung: 'Ältere Version zurückholen', beschreibung: 'Übernimmt die Version als neue, höchste Version; es geht nichts verloren.', intern: { methode: 'POST', pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen' }, parameter: [id('des Dokuments'), { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' }], antwort: 'Dokument', status: 201 },
  { methode: 'POST', pfad: '/dokumente/gleiche', gruppe: 'Dokumente', zusammenfassung: 'Gibt es diese Dateien schon?', beschreibung: 'Doppelte Dateien (#333): SHA-256-Prüfwerte (hex, höchstens 100) → Fundstellen je Prüfwert, nur in Mappen, die der Schlüssel lesen darf. Prüfwerte ohne lesbare Fundstelle fehlen in der Antwort. ohneMappe lässt eine Mappe aus (z. B. die, in die man gerade hochlädt).', intern: { methode: 'POST', pfad: '/api/dokumente/gleiche' }, body: 'Gleiche', antwort: 'Fundstellen' },
  { methode: 'GET', pfad: '/dokumente/{id}/inhalt', gruppe: 'Dokumente', zusammenfassung: 'Inhalt eines Dokuments herunterladen', intern: { methode: 'GET', pfad: '/api/dokumente/:id/inhalt' }, parameter: [id('des Dokuments')], antwort: 'binaer' },
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
  { methode: 'PUT', pfad: '/dokumente/{id}/archivnummer', gruppe: 'Dokumente', zusammenfassung: 'Archivnummer setzen', beschreibung: 'Archivnummer des Papieroriginals (#345), eindeutig je Haushalt (ohne Groß-/Kleinschreibung); ein vorangestelltes „DMS-ASN:“ aus dem Barcode wird entfernt, leer entfernt die Nummer. 409, wenn ein anderes Dokument sie schon hat. Braucht Bearbeiten an der Mappe.', intern: { methode: 'PUT', pfad: '/api/dokumente/:id/archivnummer' }, parameter: [id('des Dokuments')], body: 'Archivnummer', antwort: 'Dokument' },
  { methode: 'GET', pfad: '/archivnummern/{nr}', gruppe: 'Dokumente', zusammenfassung: 'Dokument zu einer Archivnummer', beschreibung: 'Sucht das Dokument mit dieser Archivnummer (#345, auch mit „DMS-ASN:“ davor); 404, wenn es keins gibt oder die Mappe nicht lesbar ist.', intern: { methode: 'GET', pfad: '/api/archivnummern/:nr' }, parameter: [{ name: 'nr', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Archivnummer, z. B. A-000123' }], antwort: 'ArchivnummerTreffer' },
  { methode: 'DELETE', pfad: '/dokumente/{id}', gruppe: 'Dokumente', zusammenfassung: 'Dokument löschen', beschreibung: 'Ist der Papierkorb eingeschaltet, kommt das Dokument mit allen Versionen in den Papierkorb (#344); sonst ist es endgültig weg.', intern: { methode: 'DELETE', pfad: '/api/dokumente/:id' }, parameter: [id('des Dokuments')], antwort: null, status: 204 },

  { methode: 'POST', pfad: '/typen', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp anlegen (Administrator)', intern: { methode: 'POST', pfad: '/api/typen' }, body: 'MappentypEingabe', antwort: 'Mappentyp', status: 201 },
  { methode: 'PUT', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp ändern (Administrator)', beschreibung: 'Titel und Passung aller Mappen des Typs werden neu berechnet.', intern: { methode: 'PUT', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], body: 'MappentypEingabe', antwort: 'Mappentyp' },
  { methode: 'DELETE', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp löschen (Administrator)', beschreibung: 'Nur ohne Mappen und ohne Verweise anderer Typen.', intern: { methode: 'DELETE', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Alle Benutzer (Administrator)', intern: { methode: 'GET', pfad: '/api/benutzer' }, antwort: 'BenutzerListe' },
  { methode: 'POST', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Benutzer anlegen und einladen (Administrator)', intern: { methode: 'POST', pfad: '/api/benutzer' }, body: 'BenutzerEingabe', antwort: 'LinkErgebnis', status: 201 },
  { methode: 'PUT', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer ändern (Administrator)', intern: { methode: 'PUT', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], body: 'BenutzerAenderung', antwort: 'Benutzer' },
  { methode: 'DELETE', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer löschen (Administrator)', beschreibung: 'Nur solange die Einladung nie angenommen wurde; wer sich schon angemeldet hat, wird über PUT mit aktiv=false deaktiviert.', intern: { methode: 'DELETE', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], antwort: null, status: 204 },
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
      min: { type: 'number' }, max: { type: 'number' }, nachkomma: { type: 'integer' }, muster: { type: 'string' }, optionen: { type: 'array', items: { type: 'string' } },
      system: { type: 'boolean', readOnly: true, description: 'Systemfeld eines Systemmappentyps: nicht entfernbar, nur Bezeichnung und Hilfetext änderbar' },
      mehrfach: { type: 'boolean' }, zielTyp: { ...uuid, description: 'Bei typ=referenz: Id des Ziel-Mappentyps' }, verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] }, waehrung: { type: 'string' },
    },
  },
  Register: { type: 'object', required: ['key', 'name', 'art'], properties: { key: { type: 'string' }, name: { type: 'string' }, art: { type: 'string', enum: Object.keys(REGISTERARTEN) }, felder: { type: 'array', items: { type: 'string' } }, quellen: { type: 'array', items: { type: 'object', properties: { typId: uuid, feldKey: { type: 'string' }, trefferliste: { type: 'string', description: 'Kennung einer Trefferliste des Quelltyps; das Register zeigt dann deren Spalten' } } } } } },
  MappentypEingabe: {
    type: 'object', required: ['name', 'felder'],
    properties: { name: { type: 'string' }, schluessel: { type: 'string', example: 'rechnung', description: 'Feste Kennung; beim Anlegen frei wählbar (sonst aus dem Namen), danach unveränderlich' }, beschreibung: { type: 'string' }, titelVorlage: { type: 'string', example: '{rechnungsnummer} vom {rechnungsdatum}' }, felder: liste('Feld'), register: liste('Register'),
      trefferlisten: { type: 'array', description: 'Trefferlisten; genau eine ist Standard', items: { type: 'object', required: ['key', 'name', 'spalten'], properties: { key: { type: 'string' }, name: { type: 'string' }, spalten: { type: 'array', items: { type: 'string' }, description: 'Feldschlüssel oder _titel, _erstellt, _erstelltVon, _geaendert, _geaendertVon' }, standard: { type: 'boolean' } } } },
      trefferliste: { type: 'array', items: { type: 'string' }, description: 'Spalten der Standard-Trefferliste (ältere Form); wenn angegeben, ersetzt sie deren Spalten' },
      archiv: { type: 'object', nullable: true, description: 'Archivmodus (#212); null = aus. Frist bis Ende des Kalenderjahres des Stichtags + jahre; vorher kein Löschen (409). Die Versionierung der Dokumentenregister ist dann Pflicht.', properties: { jahre: { type: 'integer', minimum: 1, maximum: 30 }, stichtag: { type: 'string', nullable: true, description: 'Kennung eines Datumsfelds; null = Anlagedatum' } } },
      erstellenErlaubt: { type: 'boolean', default: true, deprecated: true, description: 'Ohne Wirkung seit 0.32 – wer anlegen darf, regeln die Berechtigungen (Recht C)' },
      sichtAnlegen: { type: 'boolean', default: true, writeOnly: true, description: 'Nur beim Anlegen: eigene Ansicht in der Ablage anlegen' },
      loeschenErlaubt: { type: 'boolean', default: true, deprecated: true, description: 'Ohne Wirkung seit 0.32 – wer löschen darf, regeln die Berechtigungen (Recht D)' } },
  },
  Mappentyp: { allOf: [ref('MappentypEingabe'), { type: 'object', properties: { id: uuid, erstellt: zeit, geaendert: zeit, system: { type: 'string', enum: ['benutzer', 'rolle', 'post'], nullable: true, description: 'Systemmappentyp: lässt sich erweitern, aber nicht löschen' } } }] },
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
    },
  },
  PapierkorbListe: liste('PapierkorbEintrag'),
  Wiederhergestellt: { type: 'object', properties: { mappe: ref('Mappe'), verweiseEntfallen: { type: 'integer', description: 'Verweise auf Mappen, die es nicht mehr gibt' } } },
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
      id: uuid, mappeId: uuid, empfaengerId: { ...uuid, nullable: true, description: 'null = Administratoren' }, art: { type: 'string', enum: ['passung', 'erwaehnung', 'manuell', 'vertretung', 'frist', 'erinnerung', 'post'] },
      text: { type: 'string' }, feldKey: { type: 'string', nullable: true }, datum: { type: 'string', format: 'date', nullable: true, description: 'Frist und Erinnerung: das Datum, um das es geht' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true },
      erledigt: { ...zeit, nullable: true }, erledigtVon: { ...uuid, nullable: true }, mappeTitel: { type: 'string' }, typId: uuid,
    },
  },
  AufgabenListe: liste('Aufgabe'),
  AufgabeEingabe: { type: 'object', required: ['empfaengerId', 'text'], properties: { empfaengerId: uuid, text: { type: 'string' } } },
  Favorit: { type: 'object', properties: { favorit: { type: 'boolean' } } },
  Delegieren: { type: 'object', required: ['empfaengerId'], properties: { empfaengerId: uuid } },
  Notiz: { type: 'object', properties: { id: uuid, mappeId: uuid, text: { type: 'string', description: 'Markdown' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, geaendert: zeit, geaendertVon: { ...uuid, nullable: true } } },
  NotizListe: liste('Notiz'),
  PostEingabe: { type: 'object', properties: {
    betreff: { type: 'string', description: 'Standard „Neue Post“' }, datum: { type: 'string', format: 'date' }, absender: { type: 'string', description: 'Standard: Name des Benutzers' },
    fuer: { ...uuid, description: 'Id eines Benutzers: Er bekommt die Aufgabe „Post für dich“ unter „Zu erledigen“, solange die Post neu ist.' }, nachricht: { type: 'string' },
    kanal: { type: 'string', enum: ['Hochgeladen', 'E-Mail', 'Scan', 'Ordner', 'Import', 'API', 'WebDAV'] },
    werte: { ...ref('Werte'), description: 'Werte weiterer Felder, die der Administrator am Typ Post ergänzt hat' },
  } },
  Zuordnen: { type: 'object', required: ['ziel'], properties: {
    ziel: { ...uuid, description: 'Id der Mappe, zu der die Post gehört' }, register: { type: 'string', description: 'Kennung eines Dokumentenregisters der Zielmappe; Standard: das erste' },
    dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten der Post; Standard: alle' }, kopieren: { type: 'boolean', description: 'true = Dokumente bleiben auch in der Post' },
  } },
  Zugeordnet: { type: 'object', properties: { post: ref('Mappe'), ziel: ref('Mappe') } },
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
      license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
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
