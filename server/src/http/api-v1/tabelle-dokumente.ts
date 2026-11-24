/** Tabelle /api/v1 (#20), Teil Dokumente (#1278, vorher in `http/api-v1.ts`). */
import type { V1 } from './typen';
import { id, STEMPEL_BESCHREIBUNG, VERKLEINERN_BESCHREIBUNG, stempelParameter, verkleinernParameter } from './parameter';

/** Dokumente: ersetzen, Versionen, Inhalt, Volltext, Vektoren, Fassungen, Archivfassung, Leerseiten, Anlagen, Seiten, Schwärzen, Verkleinern, Archivnummern. */
export const V1_DOKUMENTE: V1[] = [
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/ersetzen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Neue Version eines Dokuments',
    beschreibung:
      'Versionierung (#194): Rohe Bytes als Body; das Dokument behält seine Id, die bisherige Datei bleibt als ältere Version. Name und Dateityp dürfen sich ändern. 409, wenn die Versionierung des Registers aus ist.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/ersetzen' },
    parameter: [
      id('des Dokuments'),
      { name: 'name', wo: 'query', typ: 'string', beschreibung: 'Neuer Dateiname; ohne Angabe bleibt der bisherige' },
      { name: 'typ', wo: 'query', typ: 'string', beschreibung: 'MIME-Typ (nur Angabe)' },
    ],
    body: 'binaer',
    antwort: 'Dokument',
    status: 201,
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/versionen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Versionen eines Dokuments',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/versionen' },
    parameter: [id('des Dokuments')],
    antwort: 'Versionen',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/versionen/{nummer}/inhalt',
    gruppe: 'Dokumente',
    zusammenfassung: 'Ältere Version herunterladen',
    beschreibung: `Wie der Inhalt des Dokuments (auch beim Recht: Lesen und Exportrecht E), mit denselben Stempel-Parametern und verkleinern.${STEMPEL_BESCHREIBUNG}${VERKLEINERN_BESCHREIBUNG}`,
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/versionen/:nummer/inhalt' },
    parameter: [
      id('des Dokuments'),
      { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' },
      ...stempelParameter,
      verkleinernParameter,
    ],
    antwort: 'binaer',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/versionen/{nummer}/zurueckholen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Ältere Version zurückholen',
    beschreibung: 'Übernimmt die Version als neue, höchste Version; es geht nichts verloren.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen' },
    parameter: [id('des Dokuments'), { name: 'nummer', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Nummer der Version' }],
    antwort: 'Dokument',
    status: 201,
  },
  {
    methode: 'POST',
    pfad: '/dokumente/gleiche',
    gruppe: 'Dokumente',
    zusammenfassung: 'Gibt es diese Dateien schon?',
    beschreibung:
      'Doppelte Dateien (#333): SHA-256-Prüfwerte (hex, höchstens 100) → Fundstellen je Prüfwert, nur in Mappen, die der Schlüssel lesen darf. Prüfwerte ohne lesbare Fundstelle fehlen in der Antwort. ohneMappe lässt eine Mappe aus (z. B. die, in die man gerade hochlädt).',
    intern: { methode: 'POST', pfad: '/api/dokumente/gleiche' },
    body: 'Gleiche',
    antwort: 'Fundstellen',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/inhalt',
    gruppe: 'Dokumente',
    zusammenfassung: 'Inhalt eines Dokuments herunterladen',
    beschreibung: `Ohne Parameter die gespeicherte Datei. Herunterladen ist Mitnehmen (#723): braucht Lesen und das Exportrecht E an einer Ansicht, sonst 403; Pakete (Dienstkonten) brauchen nur Lesen.${STEMPEL_BESCHREIBUNG}${VERKLEINERN_BESCHREIBUNG} Beispiel: ?vorlage=kopie&empfaenger=Hausverwaltung%20M%C3%BCller oder ?stempel=ENTWURF%0ASeite%20{seite}%20von%20{seiten}&lage=diagonal&deckkraft=0.2 oder ?verkleinern=standard.`,
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/inhalt' },
    parameter: [id('des Dokuments'), ...stempelParameter, verkleinernParameter],
    antwort: 'binaer',
  },
  {
    methode: 'GET',
    pfad: '/stempel/vorlagen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Stempel-Vorlagen',
    beschreibung:
      'Vorlagen für Stempel beim Weitergeben (#394, #799): id, name, text mit Platzhaltern (mehrzeilig), lage, deckkraft, seiten, tinte, drehung, x, y, farbe, groesse; umgestellt = true, wenn die Vorlage die entfallenen Haken für Seitenzahlen bzw. Archivnummer hatte und ihr Text dafür eine Zeile bekommen hat. Ob ein Mappentyp einen Stempel vorschlägt oder verlangt, steht an GET /typen unter stempel ({ modus: vorschlag|pflicht, vorlage }).',
    intern: { methode: 'GET', pfad: '/api/stempel/vorlagen' },
    antwort: 'StempelVorlagen',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/volltext',
    gruppe: 'Dokumente',
    zusammenfassung: 'Volltext eines Dokuments',
    beschreibung: 'Textebene des PDFs oder Ergebnis der Texterkennung; text ist null, solange es keinen gibt (siehe ocr.stand).',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/volltext' },
    parameter: [id('des Dokuments')],
    antwort: 'Volltext',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/volltext',
    gruppe: 'Dokumente',
    zusammenfassung: 'Volltext schreiben',
    beschreibung:
      'Für Pakete mit eigener Texterkennung (#338) oder mit dem Recht „dms:volltext“ (#614): ersetzt den Volltext. Dienstkonten brauchen das Recht „Dokumente schreiben“ aus dem Manifest – oder dms:volltext mit „Dokumente lesen“, dann nur für Dokumente der Dateitypen aus code.volltext (sonst 403); Benutzer das Recht Bearbeiten an der Mappe. Höchstens 5 Millionen Zeichen (413), der Körper darf dafür bis 32 MB groß sein. Die Herkunft steht in ocr.info und in der Historie; die eingebaute Texterkennung überschreibt den Text danach nicht mehr von selbst. Mit sprache (#400) gibt das Paket die Sprache des Texts an, sonst erkennt Ablago sie. Mehrere Sprachen (#579): Seiten im Text durch Seitenvorschub (\\f) trennen und in seitensprachen je Seite ihre Sprache(n) nennen (Mischseite: zwei, null: Ablago erkennt sie) – der Suchindex nimmt dann je Seite die Wortstämme ihrer Sprache, das Dokument bekommt Hauptsprache und weitere Sprachen. Gespeichert wird der Text mit Leerzeilen zwischen den Seiten.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/volltext' },
    parameter: [id('des Dokuments')],
    body: 'VolltextSchreiben',
    antwort: 'Volltext',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/sprache',
    gruppe: 'Dokumente',
    zusammenfassung: 'Sprache des Volltexts setzen',
    beschreibung:
      'Sprache des Dokuments (#400) als Kennung wie bei Tesseract (deu, eng, fra, spa, ita, nld, tur, pol, por, rus, ukr, ara) oder null (keine Angabe = Deutsch). Die Volltextsuche nimmt die Wortstämme dieser Sprache; der Suchindex des Dokuments entsteht dabei neu. Mit weitere (#579) auch die weiteren Sprachen fürs ganze Dokument (der Suchindex nimmt den Text dann zusätzlich mit deren Wortstämmen; Seitensprachen entfallen); ohne weitere bleiben sie. Rechte wie beim Volltext schreiben; steht in der Historie.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/sprache' },
    parameter: [id('des Dokuments')],
    body: 'SpracheSetzen',
    antwort: 'DokumentSprache',
  },
  {
    methode: 'DELETE',
    pfad: '/dokumente/{id}/teilen-hinweis',
    gruppe: 'Dokumente',
    zusammenfassung: 'Hinweis „Post teilen?“ ausblenden',
    beschreibung:
      'Der Hinweis „Ab Seite N beginnt vermutlich ein eigenes Schreiben – Post teilen?“ (#579, teilenAb am Dokument) erscheint nicht mehr – für alle, bis das Dokument einen neuen Volltext bekommt. Geteilt wird nie von selbst. Braucht Bearbeiten an der Mappe.',
    intern: { methode: 'DELETE', pfad: '/api/dokumente/:id/teilen-hinweis' },
    parameter: [id('des Dokuments')],
    antwort: 'TeilenHinweis',
  },
  // Vektoren zu Dokumenten (#442): Schnittstelle für Pakete mit dem Recht dms:vektoren; der Kern rechnet keine Vektoren.
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/vektor',
    gruppe: 'Dokumente',
    zusammenfassung: 'Vektor eines Dokuments setzen',
    beschreibung:
      'Für Pakete mit dem Recht „dms:vektoren“ (#442), z. B. „KI lokal – Ähnlichkeit“: legt je Dokument und Modell einen Vektor ab (ersetzt einen vorhandenen). Der Kern normiert ihn auf Länge 1 und vergleicht mit dem Kosinus. Alle Vektoren eines Modells haben dieselbe Länge (8 bis 4096). Ein neues Modell desselben Pakets macht dessen alte Vektoren ungültig (sie werden entfernt und im Hintergrund neu berechnet). Das Paket muss das Dokument lesen dürfen; andere Aufrufer bekommen 403.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/vektor' },
    parameter: [id('des Dokuments')],
    body: 'VektorSetzen',
    antwort: 'VektorGesetzt',
  },
  {
    methode: 'DELETE',
    pfad: '/dokumente/{id}/vektor',
    gruppe: 'Dokumente',
    zusammenfassung: 'Vektor eines Dokuments löschen',
    beschreibung: 'Für Pakete mit dem Recht „dms:vektoren“ (#442). Mit dem Dokument verschwinden seine Vektoren ohnehin.',
    intern: { methode: 'DELETE', pfad: '/api/dokumente/:id/vektor' },
    parameter: [id('des Dokuments'), { name: 'modell', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Kennung des Modells' }],
    antwort: 'VektorGeloescht',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/aehnliche',
    gruppe: 'Dokumente',
    zusammenfassung: 'Ähnliche Dokumente zu einem Dokument',
    beschreibung:
      'Die ähnlichsten Dokumente (Kosinus der Vektoren, #442) – nur in Mappen, die der Aufrufer lesen darf, absteigend. 404, wenn das Dokument keinen Vektor dieses Modells hat. Leere Liste ohne Paket mit „dms:vektoren“.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/aehnliche' },
    parameter: [
      id('des Dokuments'),
      { name: 'modell', wo: 'query', typ: 'string', beschreibung: 'Kennung des Modells; ohne Angabe das aktuelle Modell des Pakets' },
      { name: 'anzahl', wo: 'query', typ: 'integer', beschreibung: '1–100, Standard 10' },
      { name: 'schwelle', wo: 'query', typ: 'string', beschreibung: 'Zahl: nur ab dieser Ähnlichkeit (-1 bis 1)' },
    ],
    antwort: 'Aehnliche',
  },
  {
    methode: 'POST',
    pfad: '/vektoren/aehnliche',
    gruppe: 'Dokumente',
    zusammenfassung: 'Ähnliche Dokumente zu einem Vektor',
    beschreibung:
      'Wie GET /dokumente/{id}/aehnliche, aber zu einem mitgeschickten Vektor (z. B. dem eines Suchbegriffs, #442). Ändert nichts.',
    intern: { methode: 'POST', pfad: '/api/vektoren/aehnliche' },
    body: 'AehnlicheAnfrage',
    antwort: 'Aehnliche',
    status: 200,
  },
  // Dateien umwandeln (#577): Schnittstelle für Pakete mit dem Recht dms:umwandeln; das Original bleibt unverändert.
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/fassung',
    gruppe: 'Dokumente',
    zusammenfassung: 'Umgewandelte Fassung setzen (Pakete)',
    beschreibung:
      'Für Pakete mit dem Recht „dms:umwandeln“ (#577), z. B. „Bildformate“: die Fassung einer Datei, die Ablago nicht selbst liest (Ereignis datei.umwandeln), als PDF, PNG oder JPEG – roh im Körper (application/octet-stream), erkannt am Inhalt, höchstens 50 MB, Bilder höchstens 36 Millionen Bildpunkte, PDFs höchstens 1000 Seiten. Daraus entstehen Vorschaubild und Volltext (Textebene bzw. Paket Texterkennung). Die Fassung gehört zur Datei (Prüfwert), nicht zum Dokument, und ersetzt eine vorhandene. 403 ohne das Recht oder wenn das Paket für den Dateityp nicht zuständig ist (code.umwandeln), 409, wenn sha256 nicht mehr die Datei des Dokuments ist (neue Version), 413 zu groß, 415 kein PDF, PNG oder JPEG, 422 nicht lesbar.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/fassung' },
    parameter: [
      id('des Dokuments'),
      { name: 'sha256', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Prüfwert der Datei aus dem Ereignis datei.umwandeln' },
    ],
    body: 'binaer',
    antwort: 'FassungGesetzt',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/vorschaubild',
    gruppe: 'Dokumente',
    zusammenfassung: 'Vorschaubild setzen (Pakete)',
    beschreibung:
      'Für Pakete mit dem Recht „dms:umwandeln“ (#577): ein eigenes Vorschaubild der Datei (JPEG oder PNG, roh im Körper, höchstens 5 MB). Ablago verkleinert es auf seine Größe (längste Seite 104 px, JPEG) und ersetzt ein vorhandenes – auch eins aus der Fassung; schicke es deshalb nach der Fassung. Fehler wie bei der Fassung.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/vorschaubild' },
    parameter: [
      id('des Dokuments'),
      { name: 'sha256', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Prüfwert der Datei aus dem Ereignis datei.umwandeln' },
    ],
    body: 'binaer',
    antwort: 'VorschaubildGesetzt',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/fassung',
    gruppe: 'Dokumente',
    zusammenfassung: 'Umgewandelte Fassung herunterladen',
    beschreibung:
      'Die Fassung (PDF, PNG oder JPEG), die ein Paket aus einer Datei gemacht hat, die Ablago nicht selbst liest (#577); Dateiname „… (umgewandelt)“, der Kopf x-dms-fassung-paket nennt Paket und Version. Das Dokument selbst bleibt das Original. 404, wenn es keine gibt. Braucht Lesen und – für Menschen mit API-Schlüssel – das Exportrecht E (#723, sonst 403); Pakete brauchen nur Lesen. Mit API-Schlüssel gilt der Abruf als Herausgeben (#799): mit Pflicht-Stempel oder Stempel-Parametern kommt eine gestempelte Kopie als PDF (Kopf X-DMS-Stempel: 1).',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/fassung' },
    parameter: [id('des Dokuments'), { name: 'herunterladen', wo: 'query', typ: 'string', beschreibung: 'Herunterladen statt anzeigen' }],
    antwort: 'binaer',
  },
  // Archivfassung (PDF/A, #631): Schnittstelle für Pakete mit dem Recht dms:archivfassung; das Original bleibt unverändert.
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/archivfassung',
    gruppe: 'Dokumente',
    zusammenfassung: 'Archivfassung (PDF/A) ablegen (Pakete)',
    beschreibung:
      'Für Pakete mit dem Recht „dms:archivfassung“ (#631), z. B. „PDF/A“: das durchsuchbare PDF/A zu einem Dokument (Ereignis datei.archivfassung) – roh im Körper (application/octet-stream), höchstens 100 MB und 1000 Seiten. Der Kern nimmt nur ein PDF mit PDF/A-Kennung in den XMP-Metadaten (pdfaid:part 1–4 und pdfaid:conformance, Metadaten ungefiltert) und ohne JavaScript, Aktionen oder Verweise auf externe Inhalte; sonst 422 mit Grund, der auch am Dokument steht. Die Archivfassung gehört zur Datei (Prüfwert) und ersetzt eine vorhandene; ein Eintrag in der Historie. 403 ohne das Recht oder wenn das Paket für den Dateityp nicht zuständig ist (code.archivfassung), 409, wenn sha256 nicht mehr die Datei des Dokuments ist, 413 zu groß, 415 kein PDF.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/archivfassung' },
    parameter: [
      id('des Dokuments'),
      {
        name: 'sha256',
        wo: 'query',
        typ: 'string',
        pflicht: true,
        beschreibung: 'Prüfwert der Datei aus dem Ereignis datei.archivfassung',
      },
    ],
    body: 'binaer',
    antwort: 'ArchivfassungGesetzt',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/archivfassung',
    gruppe: 'Dokumente',
    zusammenfassung: 'Archivfassung (PDF/A) herunterladen',
    beschreibung:
      'Die Archivfassung zur aktuellen Datei des Dokuments (#631); Dateiname „… (PDF-A).pdf“, der Kopf x-dms-archivfassung nennt Kennung, Paket und Version („original“: das Original ist schon PDF/A). Nach einer Änderung am Original (neue Version, Seiten, Schwärzen) gibt es sie erst wieder, wenn das Paket neu erzeugt hat. 404 ohne. Braucht Lesen und – für Menschen mit API-Schlüssel – das Exportrecht E (#723, sonst 403); Pakete brauchen nur Lesen und bekommen die Archivfassung immer unverändert. Mit API-Schlüssel gilt der Abruf als Herausgeben (#799): Verlangt der Mappentyp einen Stempel oder kommen Stempel-Parameter mit, kommt eine gestempelte Kopie (Kopf X-DMS-Stempel: 1), der Stempel steht auf den Seiten selbst; die gespeicherte Archivfassung bleibt unverändert.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/archivfassung' },
    parameter: [id('des Dokuments'), { name: 'herunterladen', wo: 'query', typ: 'string', beschreibung: 'Herunterladen statt anzeigen' }],
    antwort: 'binaer',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/wortpositionen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Wortpositionen (für die Archivfassung)',
    beschreibung:
      'Je Seite der Quelle (Original bzw. bei TIFF und Co. die Lesefassung) die Wörter mit Lage [Text, x, y, b, h], relativ zur angezeigten Seite (0…1, Ursprung oben links) – aus der Textebene des PDFs, sonst aus der Texterkennung (die sie mit PUT …/volltext als woerter schickt), sonst keine (quelle „keine“). breite/hoehe: Seite in pt (PDF) bzw. Bildpunkten (Bild). vollstaendig: jede Seite hat Wörter. Braucht Lesen (#631).',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/wortpositionen' },
    parameter: [
      id('des Dokuments'),
      {
        name: 'fassung',
        wo: 'query',
        typ: 'string',
        beschreibung:
          '„archiv“ (#1137): Seiten, Größen und Wörter aus der Textebene der Archivfassung (PDF/A, quelle „archiv“), z. B. für E-Mails; 404 ohne',
      },
    ],
    antwort: 'Wortpositionen',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/seiten/{nr}/scan',
    gruppe: 'Dokumente',
    zusammenfassung: 'Seite als Graustufenbild (PGM) oder Farbbild (PPM)',
    beschreibung:
      'Für eine Texterkennung im Paket (#338): die Seite eines PDFs als PGM (8 Bit, „P5 Breite Höhe 255“, danach die Bildpunkte). Mit `farbe=1` (#716) als Farbbild PPM („P6 Breite Höhe 255“, je Bildpunkt 3 Bytes R, G, B), z. B. für die Archivfassung (PDF/A); gleiche Grenzen. Seit 0.133.0 (#458) auch JPEG und PNG: Seite 1 in Originalgröße (dpi zählt dort nicht); nennt die Bilddatei mehr als 300 dpi (Scan), kommt sie auf 300 dpi verkleinert (#1600), das Dokument trägt dann verkleinertDpi. Seit 0.137.0 (#577) für andere Dateitypen die Seiten ihrer umgewandelten Fassung. 404, wenn es die Seite nicht gibt; 422 für andere Dateitypen ohne Fassung oder zu große Seiten. Mit API-Schlüssel eines Menschen gilt der Abruf als Herausgeben (#799): Exportrecht E nötig; gilt ein Stempel (Pflicht des Mappentyps oder Stempel-Parameter), entsteht das Bild aus der gestempelten Kopie (Bilder und umgewandelte Dateien dabei als PDF-Seite). Pakete bekommen die Seiten, wie sie abgelegt sind.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/scan' },
    parameter: [
      id('des Dokuments'),
      { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seitennummer ab 1' },
      { name: 'dpi', wo: 'query', typ: 'integer', beschreibung: 'Auflösung 72–400, ohne Angabe 300' },
      { name: 'farbe', wo: 'query', typ: 'string', beschreibung: '1: Farbbild (PPM, P6) statt Graustufen (#716)' },
    ],
    antwort: 'binaer',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/texterkennung',
    gruppe: 'Dokumente',
    zusammenfassung: 'Texterkennung (erneut) anstoßen',
    beschreibung: 'Stellt das Dokument in die Warteschlange der Texterkennung, z. B. nach einem Fehler.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/texterkennung' },
    parameter: [id('des Dokuments')],
    antwort: 'Dokument',
  },
  // Leerseiten (#997): Pakete mit dms:leerseiten markieren nur; weggelassen wird beim Übernehmen (POST /post/{id}/zuordnen).
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/leerseiten',
    gruppe: 'Dokumente',
    zusammenfassung: 'Leerseiten eines Dokuments in Post',
    beschreibung:
      'Leerseiten (#997): welche Seiten ein Paket mit dem Recht „dms:leerseiten“ als leer markiert hat, die Wahl je Seite („Doch behalten“, „Auch weglassen“) und wegfallend – die Seiten, die beim Übernehmen in eine Mappe wegfallen. leerseiten ist null, solange nichts markiert ist oder die Datei sich seitdem geändert hat. Nur Dokumente in Post (sonst 409), nur PDF, JPEG und PNG (sonst 422). Braucht Lesen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/leerseiten' },
    parameter: [id('des Dokuments')],
    antwort: 'LeerseitenStand',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/leerseiten',
    gruppe: 'Dokumente',
    zusammenfassung: 'Leerseiten markieren (Pakete)',
    beschreibung:
      'Für Pakete mit dem Recht „dms:leerseiten“ (#997), z. B. „Leerseiten“: seiten ersetzt die erkannten leeren Seiten (Nummern ab 1, leer = keine), sha256 nennt die geprüfte Datei (sonst 409). Die Wahl der Personen bleibt, solange die Datei dieselbe ist. Das Paket markiert nur: Es löscht nichts, ändert weder Datei noch Post (kein „zuletzt geändert“, keine Historie, kein Ereignis). Nur Dokumente in Post, die das Paket lesen darf (409 bei anderen Mappen); andere Aufrufer bekommen 403.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/leerseiten' },
    parameter: [id('des Dokuments')],
    body: 'LeerseitenMarkieren',
    antwort: 'LeerseitenStand',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/leerseiten/{nr}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Seite behalten oder weglassen',
    beschreibung:
      'Wahl einer Person (#997) für eine Seite eines Dokuments in Post: weglassen=true („Auch weglassen“) – die Seite fällt beim Übernehmen weg; false („Doch behalten“) – sie bleibt. Geht auch ohne Markierung eines Pakets. Nichts wird jetzt gelöscht. Braucht Bearbeiten an der Post; Pakete bekommen 403, versendete E-Mails 422.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/leerseiten/:nr' },
    parameter: [id('des Dokuments'), { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seitennummer ab 1' }],
    body: 'LeerseiteWahl',
    antwort: 'LeerseitenStand',
  },
  // Anlagen (#998): lesen mit Lesen, ändern mit Bearbeiten an der Mappe; Pakete ändern nur mit dms:anlagen und nur in Post.
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/anlagen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Anlagen eines Dokuments',
    beschreibung:
      'Anlagen (#998): das Dokument und seine Anlagen in ihrer Reihenfolge (anlageNr 1, 2 …). Bei einer Anlage kommt ihr Hauptdokument mit allen Anlagen. Anlagen liegen immer in derselben Mappe und demselben Register wie ihr Hauptdokument; Rechte wie beim Hauptdokument. Braucht Lesen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/anlagen' },
    parameter: [id('des Dokuments')],
    antwort: 'Anlagen',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/anlagen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Dokument als Anlage anhängen',
    beschreibung:
      '„Als Anlage an … hängen“ (#998): dokument wird die nächste Anlage dieses Dokuments – nur ein Dokument derselben Mappe (sonst 422), es kommt ins Register des Hauptdokuments; name benennt es dabei um (sonst bleibt sein Name). Hängt es an einem anderen Hauptdokument, wechselt es; hat es selbst Anlagen, kommen sie gleich dahinter mit. Eine Anlage kann keine Anlagen haben (409). Höchstens 99 Anlagen. Historie der Mappe. Braucht Bearbeiten; Pakete zusätzlich das Recht dms:anlagen und nur in Post (sonst 403).',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/anlagen' },
    parameter: [id('des Hauptdokuments')],
    body: 'AnlageAnhaengen',
    antwort: 'Anlagen',
    status: 201,
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/anlagen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Anlagen umsortieren',
    beschreibung:
      'Reihenfolge der Anlagen (#998): reihenfolge nennt genau die Anlagen des Dokuments, jede einmal (sonst 422); sie heißen danach Anlage 1, 2 … in dieser Reihenfolge. Historie der Mappe. Braucht Bearbeiten; Pakete wie oben.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/anlagen' },
    parameter: [id('des Hauptdokuments')],
    body: 'AnlagenReihenfolge',
    antwort: 'Anlagen',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/anlagen/{anlage}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Anlage umbenennen',
    beschreibung:
      'Anlage umbenennen (#998): Der Vorgabe-Name „<Name des Dokuments> – Anlage 1“ ist nur ein Vorschlag. 404, wenn anlage keine Anlage dieses Dokuments ist. Historie der Mappe. Braucht Bearbeiten; Pakete wie oben.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/anlagen/:anlage' },
    parameter: [id('des Hauptdokuments'), { name: 'anlage', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Id der Anlage' }],
    body: 'AnlageName',
    antwort: 'Anlagen',
  },
  {
    methode: 'DELETE',
    pfad: '/dokumente/{id}/anlagen/{anlage}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Anlage lösen (zum eigenen Dokument machen)',
    beschreibung:
      '„Zum eigenen Dokument machen“ (#998): Die Anlage bleibt in Mappe und Register, hat danach kein Hauptdokument mehr; die übrigen rücken auf. Nichts wird gelöscht. 404, wenn anlage keine Anlage dieses Dokuments ist. Historie der Mappe. Braucht Bearbeiten; Pakete wie oben.',
    intern: { methode: 'DELETE', pfad: '/api/dokumente/:id/anlagen/:anlage' },
    parameter: [id('des Hauptdokuments'), { name: 'anlage', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Id der Anlage' }],
    antwort: 'Anlagen',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/seiten',
    gruppe: 'Dokumente',
    zusammenfassung: 'Seiten eines PDFs',
    beschreibung: 'PDF bearbeiten (#335): Seitenzahl und Drehung je Seite (Grad). 422 bei anderen Dateitypen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten' },
    parameter: [id('des Dokuments')],
    antwort: 'Seiten',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/seiten/{nr}/bild',
    gruppe: 'Dokumente',
    zusammenfassung: 'Bild einer Seite',
    beschreibung:
      'Kleines JPEG (längste Seite 260 px) für eine Seitenansicht; für die ersten 400 Seiten. Mit API-Schlüssel eines Menschen gilt der Abruf als Herausgeben (#799): Exportrecht E nötig; gilt ein Stempel (Pflicht des Mappentyps oder Stempel-Parameter), entsteht das Bild aus der gestempelten Kopie (Bilder und umgewandelte Dateien dabei als PDF-Seite). Pakete bekommen die Seiten, wie sie abgelegt sind.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/bild' },
    parameter: [id('des Dokuments'), { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seitennummer ab 1' }],
    antwort: 'binaer',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/seiten',
    gruppe: 'Dokumente',
    zusammenfassung: 'PDF bearbeiten: drehen, Seiten löschen, umsortieren, teilen',
    beschreibung:
      'PDF bearbeiten (#335). seiten = die Seiten des Ergebnisses in der gewünschten Reihenfolge (nr im Original ab 1, drehung zusätzlich im Uhrzeigersinn: 0/90/180/270); fehlende Seiten fallen weg. teile = Positionen in seiten (ab 0), an denen ein neuer Teil beginnt. ' +
      'Ohne teile: neue Version des Dokuments; ist die Versionierung des Registers aus, ersetzt das Ergebnis das Dokument nur mit bestaetigt=true (sonst 409 mit rueckfrage), das bisherige kommt in den Papierkorb. ' +
      'Mit teile in einer Mappe: Teil 1 wird die neue Version, die weiteren Teile werden eigene Dokumente „Name (Teil n).pdf“ im selben Register. ' +
      'Mit teile bei Post („Post teilen nach Seitenbereichen“): je Teil eine neue Post (Stand Neu, Betreff „… (Teil n)“); die Ausgangspost behält ihr Dokument, hat Stand Erledigt und verweist auf die neuen. Texterkennung läuft für die Ergebnisse neu. ' +
      'Anlagen (#998, z. B. Trennblatt mit zweitem Barcode): anlagen = Positionen in seiten, an denen eine Anlage zum vorherigen Teil beginnt (nie am Anfang eines Teils, höchstens 99 je Teil; sonst 422). Nur bei Post (sonst 409): Jeder Teil wird eine neue Post, sein Dokument bekommt dort die Anlagen „<Name> – Anlage 1.pdf“, „– Anlage 2.pdf“ …; bei nur einem Teil behält die neue Post den Betreff. Anlagen entstehen nie in anderen Mappen. Pakete brauchen dafür das Recht dms:anlagen (sonst 403). Hat das Dokument schon Anlagen (#1303), wandern sie mit in die neue Post des ersten Teils: als Anlage 1 … n in ihrer Reihenfolge und mit ihren Namen (dieselben Dokumente mit Fassungen und Volltext), die neuen folgen dahinter; die Ausgangspost behält das Dokument ohne Anlagen. Die Grenze von 99 Anlagen gilt für bisherige und neue zusammen (sonst 422, ohne dass etwas entsteht). Ohne anlagen bleiben bisherige Anlagen, wo sie sind. ' +
      'E-Mail-Postfach (#999): Post mit Kanal „E-Mail“ teilt kein Paket (teile oder anlagen: 409) – eine E-Mail bleibt eine Post; Menschen und API-Schlüssel von Personen dürfen.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/seiten' },
    parameter: [id('des Dokuments')],
    body: 'SeitenBearbeiten',
    antwort: 'SeitenErgebnis',
    status: 201,
  },
  {
    methode: 'POST',
    pfad: '/dokumente/zusammenfuegen',
    gruppe: 'Dokumente',
    zusammenfassung: 'PDFs zusammenfügen',
    beschreibung:
      'PDF bearbeiten (#335): mehrere PDF-Dokumente (auch aus mehreren Mappen oder Posts, Lesen genügt) in dieser Reihenfolge zu einem neuen Dokument in ziel (Standard: die Mappe des ersten; braucht Bearbeiten). ' +
      'originaleEntfernen=true legt die Ausgangsdokumente in den Papierkorb (braucht Bearbeiten; ohne Papierkorb nur mit bestaetigt=true); eine Post, die dadurch kein Dokument mehr hat, ist danach erledigt und verweist auf das Ziel. Im Archivmodus bleiben die Ausgangsdokumente (409).',
    intern: { methode: 'POST', pfad: '/api/dokumente/zusammenfuegen' },
    body: 'Zusammenfuegen',
    antwort: 'Zusammengefuegt',
    status: 201,
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/schwaerzen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Schwärzen: Seiten und Wörter',
    beschreibung:
      'Schwärzen (#392): je Seite die Größe (pt, wie angezeigt) und die Wörter mit Lage als [Text, x, y, b, h] relativ zur Seite (0 bis 1, Ursprung oben links) – aus der Textebene, für Seiten ohne Text per Texterkennung (quelle). Damit lassen sich Suchbegriffe und Muster selbst verorten. Dazu, ob das Register versioniert ist, der Name der Kopie und die Muster. Nur PDF, JPEG und PNG (sonst 422). Braucht Lesen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen' },
    parameter: [id('des Dokuments')],
    antwort: 'SchwaerzenAnalyse',
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/schwaerzen/seiten/{nr}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Schwärzen: Seitenbild',
    beschreibung:
      'Schwärzen (#392): Seite als JPEG (längste Seite 1400 px) in derselben Lage wie die Koordinaten (Bilder nach EXIF-Ausrichtung gedreht). Braucht Lesen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen/seiten/:nr' },
    parameter: [
      id('des Dokuments'),
      { name: 'nr', wo: 'path', typ: 'integer', pflicht: true, beschreibung: 'Seite ab 1' },
      { name: 'fassung', wo: 'query', typ: 'string', beschreibung: '„archiv“ (#934): die Seite der Archivfassung (PDF/A); 404 ohne' },
    ],
    antwort: 'binaer',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/schwaerzen',
    gruppe: 'Dokumente',
    zusammenfassung: 'Dokument schwärzen',
    beschreibung:
      'Schwärzen (#392): Bereiche (Seite ab 1, x, y, b, h relativ zur Seite), Suchbegriffe (überall, ohne Groß-/Kleinschreibung, auch über Wortgrenzen; getroffen wird das ganze Wort) und/oder Muster (alle Vorschläge dieser Arten) werden endgültig entfernt: Alle Seiten werden neu gerendert (150 dpi), die Bereiche schwarz gefüllt, die Textebene ohne die Wörter darin neu aufgebaut; Metadaten, Anmerkungen, Formulare, eingebettete Dateien und JavaScript entfallen. Bilder bleiben Bilder desselben Typs (ohne EXIF). ' +
      'Ergebnis ist ein neues Dokument „… (geschwärzt)“ im selben Register (ziel=kopie, Standard; Ereignis dokument.hochgeladen) oder eine neue Version (ziel=version, nur mit Versionierung; die ungeschwärzte bleibt als ältere Version). Das Original bleibt unverändert; nicht rückgängig zu machen. Historie „geschwärzte Fassung erstellt“ ohne Suchbegriffe und Inhalt. ' +
      '422, wenn nichts zu schwärzen ist (kein Suchbegriff gefunden, keine Bereiche). Braucht Bearbeiten.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/schwaerzen' },
    parameter: [id('des Dokuments')],
    body: 'Schwaerzen',
    antwort: 'Geschwaerzt',
    status: 201,
  },
  {
    methode: 'GET',
    pfad: '/dokumente/{id}/verkleinern',
    gruppe: 'Dokumente',
    zusammenfassung: 'PDF verkleinern: Schätzung',
    beschreibung:
      'PDF verkleinern (#393): Größe, Seiten, Anzahl Bilder, höchste Bildauflösung (dpi) und je Stufe (bildschirm ≈ 100 dpi, standard ≈ 150 dpi, druck ≈ 300 dpi) die geschätzte Größe danach und ob es sich lohnt (mindestens 10 % kleiner). Dazu, ob das Register versioniert ist. 422 bei anderen Dateitypen oder verschlüsselten PDFs. Braucht Lesen.',
    intern: { methode: 'GET', pfad: '/api/dokumente/:id/verkleinern' },
    parameter: [id('des Dokuments')],
    antwort: 'VerkleinernSchaetzung',
  },
  {
    methode: 'POST',
    pfad: '/dokumente/{id}/verkleinern',
    gruppe: 'Dokumente',
    zusammenfassung: 'PDF verkleinern',
    beschreibung:
      'PDF verkleinern (#393): Bilder werden auf die Auflösung der Stufe heruntergerechnet und als JPEG neu komprimiert, doppelte und unbenutzte Objekte entfernt; Textebene und Volltext bleiben (keine neue Texterkennung). ' +
      'Ergebnis ist eine neue Version (Herkunft „in Ablago bearbeitet“, kein Ereignis dokument.hochgeladen); ist die Versionierung des Registers aus, ersetzt es das Dokument nur mit bestaetigt=true (sonst 409 mit rueckfrage), das bisherige kommt in den Papierkorb. ' +
      'Bringt es weniger als 10 %, bleibt das Dokument unverändert: 200 mit unveraendert=true und meldung; sonst 201. Braucht Bearbeiten.',
    intern: { methode: 'POST', pfad: '/api/dokumente/:id/verkleinern' },
    parameter: [id('des Dokuments')],
    body: 'Verkleinern',
    antwort: 'Verkleinert',
    status: 201,
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/archivnummer',
    gruppe: 'Dokumente',
    zusammenfassung: 'Archivnummer setzen',
    beschreibung:
      'Archivnummer des Papieroriginals (#345), eindeutig je Haushalt (ohne Groß-/Kleinschreibung); ein vorangestelltes „DMS-ASN:“ aus dem Barcode wird entfernt, leer entfernt die Nummer. 409, wenn ein anderes Dokument sie schon hat. Braucht Bearbeiten an der Mappe.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/archivnummer' },
    parameter: [id('des Dokuments')],
    body: 'Archivnummer',
    antwort: 'Dokument',
  },
  {
    methode: 'PUT',
    pfad: '/dokumente/{id}/name',
    gruppe: 'Dokumente',
    zusammenfassung: 'Dokument umbenennen',
    beschreibung:
      'Umbenennen (#1594): Die Endung des bisherigen Namens bleibt – fehlt sie im neuen Namen, wird sie angehängt, eine andere kommt davor („Strom.txt“ zu einer PDF wird „Strom.txt.pdf“). Der Name vor der ersten Umbenennung bleibt als nameOriginal. Historie der Mappe. 422 bei leerem Namen; 409 im Archivmodus während der Aufbewahrungsfrist. Braucht Bearbeiten an der Mappe.',
    intern: { methode: 'PUT', pfad: '/api/dokumente/:id/name' },
    parameter: [id('des Dokuments')],
    body: 'DokumentName',
    antwort: 'Dokument',
  },
  {
    methode: 'GET',
    pfad: '/archivnummern/{nr}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Dokument zu einer Archivnummer',
    beschreibung:
      'Sucht das Dokument mit dieser Archivnummer (#345, auch mit „DMS-ASN:“ davor); 404, wenn es keins gibt oder die Mappe nicht lesbar ist.',
    intern: { methode: 'GET', pfad: '/api/archivnummern/:nr' },
    parameter: [{ name: 'nr', wo: 'path', typ: 'string', pflicht: true, beschreibung: 'Archivnummer, z. B. A-000123' }],
    antwort: 'ArchivnummerTreffer',
  },
  {
    methode: 'DELETE',
    pfad: '/dokumente/{id}',
    gruppe: 'Dokumente',
    zusammenfassung: 'Dokument löschen',
    beschreibung:
      'Ist der Papierkorb eingeschaltet, kommt das Dokument mit allen Versionen in den Papierkorb (#344); sonst ist es endgültig weg. Steht im Löschprotokoll (#470) mit Prüfsumme, ohne Dateinamen.',
    intern: { methode: 'DELETE', pfad: '/api/dokumente/:id' },
    parameter: [
      id('des Dokuments'),
      {
        name: 'grund',
        wo: 'query',
        typ: 'string',
        beschreibung: 'Grund fürs Löschprotokoll (#470): frist, verlangen, nicht_noetig oder sonstiges',
      },
      { name: 'grundText', wo: 'query', typ: 'string', beschreibung: 'Freier Text zum Grund, ohne Personenbezug (höchstens 200 Zeichen)' },
    ],
    antwort: null,
    status: 204,
  },
];
