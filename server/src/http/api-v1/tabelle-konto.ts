/** Tabelle /api/v1 (#20), Teil Konto (#1278, vorher in `http/api-v1.ts`). */
import type { V1 } from './typen';

/** Konto: wer bin ich, Zähler, Entdecken, Abwesenheit, Zusammenfassung, Merkmale, Region. */
export const V1_KONTO: V1[] = [
  {
    methode: 'GET',
    pfad: '/ich',
    gruppe: 'Konto',
    zusammenfassung: 'Wer bin ich?',
    beschreibung: 'Benutzer und Rechte des verwendeten Schlüssels.',
    antwort: 'Ich',
    handler: async (a) => ({
      body: {
        benutzer: a.benutzer,
        schluessel: a.apiSchluessel
          ? {
              name: a.apiSchluessel.name,
              recht: a.apiSchluessel.recht,
              passwoerter: a.apiSchluessel.passwoerter,
              ablauf: a.apiSchluessel.ablauf,
            }
          : null,
      },
    }),
  },

  {
    methode: 'GET',
    pfad: '/ich/zaehler',
    gruppe: 'Konto',
    zusammenfassung: 'Zähler: neue Post, Zu erledigen, Überfälliges (nur Zahlen)',
    beschreibung:
      'Nur Zahlen für den Benutzer des Schlüssels, in dessen Rechten – keine Titel, Namen, Absender oder Inhalte (#625). neuePost: Post im Stand „Neu“, deren „An“ (Kennung an, bis 0.241 „Für“, #1042) du bist oder leer ist – Zahl und Bedeutung unverändert; zuErledigen: wie „Zu erledigen“; ueberfaellig: eigene offene Fristen, Erinnerungen und Aufgaben mit Datum vor heute. Die frühere Zahl anstehend gibt es nicht mehr (#725). stand zählt hoch, sobald sich eine Zahl gegenüber dem letzten Abruf ändert; geaendert ist der Zeitpunkt dieser Änderung. Die Antwort trägt ein ETag: Mit If-None-Match und gleichem ETag kommt 304 ohne Inhalt. Dafür genügt ein Schlüssel der Stufe „nur Zähler“, der sonst nichts darf; „lesen“ und „lesen und schreiben“ dürfen ebenfalls.',
    intern: { methode: 'GET', pfad: '/api/ich/zaehler' },
    antwort: 'Zaehlerstand',
    nichtGeaendert: true,
  },
  {
    methode: 'GET',
    pfad: '/entdecken',
    gruppe: 'Konto',
    zusammenfassung: 'Rundgänge und Tipps für die Person (Ablago entdecken)',
    beschreibung:
      'Wie in der Oberfläche (#831, #832): nur, was die Person nutzen darf (Verwaltungsrecht, eingeschaltete Funktionen, lesbare Mappentypen, installierte Pakete), Texte in ihrer Sprache. Je Tipp Anker und Seite (bzw. Anker und Mappentyp, wenn die Stelle in einer Mappe liegt) oder Rundgang, Herkunft (ablago, paket:<id>), neu, ausgeblendet und clients – nur Tipps mit clients=true eignen sich für eine App (kein Rundgang, die Stelle gibt es dort auch). tipp ist der Tipp des Tages (höchstens einer), starten der Rundgang, der jetzt von selbst startet. Dafür genügt ein Schlüssel der Stufe „lesen“ – auch für gesehen und ausgeblendet (POST, unten, #1307).',
    intern: { methode: 'GET', pfad: '/api/entdecken' },
    antwort: 'EntdeckenStand',
  },
  {
    methode: 'POST',
    pfad: '/entdecken/tipps/{schluessel}',
    gruppe: 'Konto',
    zusammenfassung: 'Tipp gesehen, erledigt, ausblenden oder wieder einblenden',
    beschreibung:
      'Merker je Person (#832), damit sich Oberfläche und App nicht doppelt melden: gezeigt (gesehen), erledigt (heute kein Tipp mehr), ausblenden (wie das ×), einblenden. Bleibt in der eigenen Ablago, keine Telemetrie. In einer Vertretung wird nichts gemerkt. Setzt nur Merker der eigenen Person – dafür genügt ein Schlüssel der Stufe „lesen“ (#1307); „nur Zähler“ nicht.',
    intern: { methode: 'POST', pfad: '/api/entdecken/tipps/:schluessel' },
    lesenGenuegt: true,
    parameter: [{ name: 'schluessel', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Schlüssel des Tipps aus GET /entdecken' }],
    body: 'TippHandlung',
    antwort: null,
    status: 204,
  },
  {
    methode: 'POST',
    pfad: '/entdecken/rundgaenge/{schluessel}',
    gruppe: 'Konto',
    zusammenfassung: 'Rundgang gesehen oder später',
    beschreibung:
      'Merker je Person (#831): gesehen (startet nicht mehr von selbst) oder spaeter (bei der nächsten Anmeldung wieder). Setzt nur Merker der eigenen Person – dafür genügt ein Schlüssel der Stufe „lesen“ (#1307); „nur Zähler“ nicht. In einer Vertretung wird nichts gemerkt.',
    intern: { methode: 'POST', pfad: '/api/entdecken/rundgaenge/:schluessel' },
    lesenGenuegt: true,
    parameter: [
      { name: 'schluessel', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Schlüssel des Rundgangs aus GET /entdecken' },
    ],
    body: 'RundgangMerker',
    antwort: null,
    status: 204,
  },
  {
    methode: 'GET',
    pfad: '/konto/abwesenheit',
    gruppe: 'Konto',
    zusammenfassung: 'Eigene Abwesenheit',
    beschreibung: 'Abwesenheit mit Vertreter und Anzahl eigener offener Aufgaben.',
    intern: { methode: 'GET', pfad: '/api/konto/abwesenheit' },
    antwort: 'AbwesenheitStand',
  },
  {
    methode: 'PUT',
    pfad: '/konto/abwesenheit',
    gruppe: 'Konto',
    zusammenfassung: 'Eigene Abwesenheit setzen',
    beschreibung:
      'Solange sie wirkt (an, und heute im Zeitraum von–bis, beides optional), gehen neue Aufgaben an den Vertreter. Vertreter ist Pflicht, sobald an=true.',
    intern: { methode: 'PUT', pfad: '/api/konto/abwesenheit' },
    body: 'Abwesenheit',
    antwort: 'Benutzer',
  },
  {
    methode: 'GET',
    pfad: '/konto/zusammenfassung',
    gruppe: 'Konto',
    zusammenfassung: 'Tägliche Zusammenfassung: eigene Einstellung',
    beschreibung:
      'Ob, um wie viel Uhr und an welchen Wochentagen die tägliche Zusammenfassung der Aufgaben kommt; uhrzeit null = Standard der Werkbank.',
    intern: { methode: 'GET', pfad: '/api/konto/zusammenfassung' },
    antwort: 'Zusammenfassung',
  },
  {
    methode: 'PUT',
    pfad: '/konto/zusammenfassung',
    gruppe: 'Konto',
    zusammenfassung: 'Tägliche Zusammenfassung einstellen',
    beschreibung:
      'uhrzeit im 15-Minuten-Raster (HH:MM) oder null, tage 1 = Montag … 7 = Sonntag (leer = aus), feiertage = nicht an Feiertagen des Bundeslands.',
    intern: { methode: 'PUT', pfad: '/api/konto/zusammenfassung' },
    body: 'ZusammenfassungEingabe',
    antwort: 'Zusammenfassung',
  },
  {
    methode: 'GET',
    pfad: '/merkmale',
    gruppe: 'Konto',
    zusammenfassung: 'Merkmale der Ablage, z. B. „beruflich genutzt“',
    beschreibung:
      'Nur lesen (#1032). Anzeige-Bedingungen an Feldern und Abschnitten (#1033) können davon abhängen – eine App, die Formulare zeigt, braucht es. Einstellen in Werkbank → Ablage aufbauen → Nutzung.',
    intern: { methode: 'GET', pfad: '/api/merkmale' },
    antwort: 'Merkmale',
  },
  {
    methode: 'GET',
    pfad: '/region',
    gruppe: 'Konto',
    zusammenfassung: 'Region der Ablage: Land, Bundesland, Zeitzone',
    beschreibung:
      'Nur lesen (#726). Die Zeitzone gilt für „heute“, Fristen, Zeitpläne und die Tägliche Zusammenfassung; das Bundesland für die Feiertage. Einstellen in Werkbank → Einstellungen → Region.',
    intern: { methode: 'GET', pfad: '/api/region' },
    antwort: 'Region',
  },
];
