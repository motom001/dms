/**
 * Anrede in Unterlagen für Dritte (#474): du oder Sie – nur für Texte, die an Personen außerhalb des DMS
 * gehen. Die Oberfläche bleibt immer beim „du“ (förmlich erst als eigene Sprachfassung mit #357).
 *
 * Alle Texte stehen hier gebündelt, je Anrede unter demselben Schlüssel, Platzhalter als {name}. So
 * lassen sie sich später ohne Umbau in Sprachdateien übernehmen (#357: `du` → „Deutsch“, `sie` →
 * „Deutsch (förmlich)“). Neue Texte für Dritte kommen hierher, nicht als Bedingung in den Code
 * (Liste der Ausgaben im Entwicklerhandbuch, „Aufbau → Unterlagen für Dritte“).
 */

export type Anrede = 'du' | 'sie';
export const ANREDEN: readonly Anrede[] = ['du', 'sie'];
export const ANREDE_STANDARD: Anrede = 'du';
export const ANREDE_NAME: Record<Anrede, string> = { du: 'du', sie: 'Sie' };

/** Gespeicherten Wert lesen; alles Unbekannte ist die Vorgabe „du“. */
export const liesAnrede = (v: unknown): Anrede => (v === 'sie' ? 'sie' : ANREDE_STANDARD);

const DU = {
  /* Auskunft nach Art. 15 DSGVO (#396): Deckblatt.pdf */
  'auskunft.rechte': 'Du hast das Recht auf Berichtigung (Art. 16 DSGVO), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Die Daten im Ordner „daten“ sind maschinenlesbar (CSV und JSON) und lassen sich in andere Systeme übernehmen.',
  'auskunft.deckblatt.einleitung': 'Ja, wir verarbeiten personenbezogene Daten zu deiner Person. Diese Datei enthält eine Kopie dieser Daten und die Angaben nach Art. 15 Abs. 1 DSGVO.',
  'auskunft.deckblatt.erwaehnungen': 'Außerdem bist du in {anzahl} genannt (gespeichert ist dort nur der Verweis auf dich):',
  'auskunft.deckblatt.herkunft.uebrige': 'Alle übrigen Daten wurden bei uns im Rahmen unserer Geschäftsbeziehung mit dir erfasst.',
  'auskunft.deckblatt.herkunft.alle': 'Die Daten wurden bei uns im Rahmen unserer Geschäftsbeziehung mit dir erfasst.',
  'auskunft.deckblatt.rechte': '6. Deine Rechte',
  /* Uebersicht.html */
  'auskunft.uebersicht.genannt': 'Hier bist du genannt',
  'auskunft.uebersicht.genannt.hinweis': 'In diesen Einträgen steht nur ein Verweis auf dich – weitere Angaben daraus betreffen dich nicht.',
  /* LIESMICH.md */
  'auskunft.liesmich.deckblatt': '**Deckblatt.pdf** – Pflichtangaben: welche Daten, Zwecke, Herkunft, Empfänger, Speicherdauer, deine Rechte.',
  'auskunft.liesmich.uebersicht': '**Uebersicht.html** – im Browser öffnen: alle Einträge mit Angaben und Links zu den Dokumenten, dazu die Einträge, in denen du nur genannt bist. **Uebersicht.csv** – dasselbe als Tabelle.',

  /* Auskunft zustellen (#455): E-Mails an die Person */
  'mail.zip.betreff': 'Deine Auskunft nach Art. 15 DSGVO',
  'mail.zip.text': 'Hallo,\n\ndu hast eine Auskunft über die Daten angefordert, die wir zu dir gespeichert haben (Art. 15 DSGVO). Du findest sie im Anhang als ZIP-Datei.\n\nDie Datei ist mit einem Passwort geschützt (AES-256). Das Passwort bekommst du auf einem anderen Weg – zum Beispiel per Telefon, SMS oder Brief –, nicht per E-Mail. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip; das eingebaute Entpacken von Windows kann das nicht.',
  'mail.zip.frist': 'Bitte antworte bis {bis}, falls etwas fehlt oder du Fragen hast.',
  'mail.link.betreff': 'Deine Auskunft nach Art. 15 DSGVO zum Abrufen',
  'mail.link.text': 'Hallo,\n\ndu hast eine Auskunft über die Daten angefordert, die wir zu dir gespeichert haben (Art. 15 DSGVO). Du kannst sie bis {bis} hier abrufen ({wie oft}):\n\n{link}\n\nZum Abrufen brauchst du deinen Abrufcode. Den bekommst du auf einem anderen Weg – zum Beispiel per Brief, Telefon oder SMS –, nicht per E-Mail. Gib den Link bitte nicht weiter.',
  'mail.link.einmal': 'einmal',
  'mail.link.mehrmals': 'höchstens {anzahl}-mal',

  /* Öffentliche Abrufseite /abruf (#455) und ihre Meldungen */
  'abruf.titel': 'Auskunft abrufen',
  'abruf.unvollstaendig': 'Dieser Link ist unvollständig. Öffne bitte den ganzen Link aus der E-Mail – er endet mit einer langen Zeichenfolge nach dem #.',
  'abruf.einleitung': 'Du hast eine Auskunft nach Art. 15 DSGVO über die hier gespeicherten Daten angefordert. Zur Sicherheit gib bitte deinen Abrufcode ein.',
  'abruf.code.herkunft': 'Den Code hast du getrennt von diesem Link bekommen – zum Beispiel per Brief, Telefon oder SMS.',
  'abruf.code': 'Abrufcode',
  'abruf.knopf': 'Auskunft herunterladen',
  'abruf.knopf.laeuft': 'Prüfe …',
  'abruf.download': 'Der Download startet ({groesse}). Speichere die ZIP-Datei an einem sicheren Ort.',
  'abruf.passwort': 'Die Datei ist mit einem Passwort geschützt. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip.',
  'abruf.rest': 'Du kannst sie mit diesem Link noch {wie oft} herunterladen.',
  'abruf.aufgebraucht': 'Damit ist der Link aufgebraucht.',
  'abruf.startet.nicht': 'Startet nichts, gib deinen Abrufcode bitte noch einmal ein.',
  'abruf.nochmal': 'Noch einmal abrufen',
  'abruf.fehler': 'Das hat gerade nicht geklappt. Bitte versuche es später noch einmal.',
  'abruf.fehler.verbindung': 'Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es noch einmal.',
  'abruf.fehler.falsch': 'Das hat nicht geklappt: Der Link oder der Abrufcode stimmt nicht, oder der Link gilt nicht mehr. Prüfe den Code (Groß- und Kleinschreibung sind egal). Nach mehreren falschen Eingaben wird der Link gesperrt – wende dich dann an den Absender der Auskunft.',
  'abruf.fehler.ungueltig': 'Dieser Link gilt nicht mehr – er ist abgelaufen, wurde so oft abgerufen wie vorgesehen oder zurückgezogen. Bitte wende dich an den Absender der Auskunft.',
  'abruf.fehler.zuviele': 'Zu viele falsche Eingaben von deinem Anschluss. Bitte versuche es später noch einmal.',
  'abruf.fehler.ticket': 'Dieser Download ist abgelaufen. Gib deinen Abrufcode bitte noch einmal ein.',
};

export type TextDritte = keyof typeof DU;

const SIE: Record<TextDritte, string> = {
  'auskunft.rechte': 'Sie haben das Recht auf Berichtigung (Art. 16 DSGVO), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Die Daten im Ordner „daten“ sind maschinenlesbar (CSV und JSON) und lassen sich in andere Systeme übernehmen.',
  'auskunft.deckblatt.einleitung': 'Ja, wir verarbeiten personenbezogene Daten zu Ihrer Person. Diese Datei enthält eine Kopie dieser Daten und die Angaben nach Art. 15 Abs. 1 DSGVO.',
  'auskunft.deckblatt.erwaehnungen': 'Außerdem sind Sie in {anzahl} genannt (gespeichert ist dort nur der Verweis auf Sie):',
  'auskunft.deckblatt.herkunft.uebrige': 'Alle übrigen Daten wurden bei uns im Rahmen unserer Geschäftsbeziehung mit Ihnen erfasst.',
  'auskunft.deckblatt.herkunft.alle': 'Die Daten wurden bei uns im Rahmen unserer Geschäftsbeziehung mit Ihnen erfasst.',
  'auskunft.deckblatt.rechte': '6. Ihre Rechte',
  'auskunft.uebersicht.genannt': 'Hier sind Sie genannt',
  'auskunft.uebersicht.genannt.hinweis': 'In diesen Einträgen steht nur ein Verweis auf Sie – weitere Angaben daraus betreffen Sie nicht.',
  'auskunft.liesmich.deckblatt': '**Deckblatt.pdf** – Pflichtangaben: welche Daten, Zwecke, Herkunft, Empfänger, Speicherdauer, Ihre Rechte.',
  'auskunft.liesmich.uebersicht': '**Uebersicht.html** – im Browser öffnen: alle Einträge mit Angaben und Links zu den Dokumenten, dazu die Einträge, in denen Sie nur genannt sind. **Uebersicht.csv** – dasselbe als Tabelle.',

  'mail.zip.betreff': 'Ihre Auskunft nach Art. 15 DSGVO',
  'mail.zip.text': 'Guten Tag,\n\nSie haben eine Auskunft über die Daten angefordert, die wir zu Ihrer Person gespeichert haben (Art. 15 DSGVO). Sie finden sie im Anhang als ZIP-Datei.\n\nDie Datei ist mit einem Passwort geschützt (AES-256). Das Passwort erhalten Sie auf einem anderen Weg – zum Beispiel per Telefon, SMS oder Brief –, nicht per E-Mail. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip; das eingebaute Entpacken von Windows kann das nicht.',
  'mail.zip.frist': 'Bitte antworten Sie bis {bis}, falls etwas fehlt oder Sie Fragen haben.',
  'mail.link.betreff': 'Ihre Auskunft nach Art. 15 DSGVO zum Abrufen',
  'mail.link.text': 'Guten Tag,\n\nSie haben eine Auskunft über die Daten angefordert, die wir zu Ihrer Person gespeichert haben (Art. 15 DSGVO). Sie können sie bis {bis} hier abrufen ({wie oft}):\n\n{link}\n\nZum Abrufen benötigen Sie Ihren Abrufcode. Diesen erhalten Sie auf einem anderen Weg – zum Beispiel per Brief, Telefon oder SMS –, nicht per E-Mail. Bitte geben Sie den Link nicht weiter.',
  'mail.link.einmal': 'einmal',
  'mail.link.mehrmals': 'höchstens {anzahl}-mal',

  'abruf.titel': 'Auskunft abrufen',
  'abruf.unvollstaendig': 'Dieser Link ist unvollständig. Bitte öffnen Sie den ganzen Link aus der E-Mail – er endet mit einer langen Zeichenfolge nach dem #.',
  'abruf.einleitung': 'Sie haben eine Auskunft nach Art. 15 DSGVO über die hier gespeicherten Daten angefordert. Zur Sicherheit geben Sie bitte Ihren Abrufcode ein.',
  'abruf.code.herkunft': 'Den Code haben Sie getrennt von diesem Link erhalten – zum Beispiel per Brief, Telefon oder SMS.',
  'abruf.code': 'Abrufcode',
  'abruf.knopf': 'Auskunft herunterladen',
  'abruf.knopf.laeuft': 'Prüfe …',
  'abruf.download': 'Der Download startet ({groesse}). Bitte speichern Sie die ZIP-Datei an einem sicheren Ort.',
  'abruf.passwort': 'Die Datei ist mit einem Passwort geschützt. Öffnen lässt sie sich zum Beispiel mit 7-Zip (Windows), Keka (macOS) oder WinZip.',
  'abruf.rest': 'Sie können sie mit diesem Link noch {wie oft} herunterladen.',
  'abruf.aufgebraucht': 'Damit ist der Link aufgebraucht.',
  'abruf.startet.nicht': 'Startet nichts, geben Sie Ihren Abrufcode bitte noch einmal ein.',
  'abruf.nochmal': 'Noch einmal abrufen',
  'abruf.fehler': 'Das hat gerade nicht geklappt. Bitte versuchen Sie es später noch einmal.',
  'abruf.fehler.verbindung': 'Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es noch einmal.',
  'abruf.fehler.falsch': 'Das hat nicht geklappt: Der Link oder der Abrufcode stimmt nicht, oder der Link gilt nicht mehr. Prüfen Sie den Code (Groß- und Kleinschreibung sind egal). Nach mehreren falschen Eingaben wird der Link gesperrt – wenden Sie sich dann an den Absender der Auskunft.',
  'abruf.fehler.ungueltig': 'Dieser Link gilt nicht mehr – er ist abgelaufen, wurde so oft abgerufen wie vorgesehen oder zurückgezogen. Bitte wenden Sie sich an den Absender der Auskunft.',
  'abruf.fehler.zuviele': 'Zu viele falsche Eingaben von Ihrem Anschluss. Bitte versuchen Sie es später noch einmal.',
  'abruf.fehler.ticket': 'Dieser Download ist abgelaufen. Geben Sie Ihren Abrufcode bitte noch einmal ein.',
};

/** Alle Texte für Dritte je Anrede – künftig der Inhalt der Sprachdateien „de“ und „de-formal“ (#357). */
export const TEXTE_DRITTE: Record<Anrede, Record<TextDritte, string>> = { du: DU, sie: SIE };

/** Text für Dritte in der gewählten Anrede; {platzhalter} werden ersetzt (unbekannte bleiben stehen). */
export function textDritte(anrede: Anrede, schluessel: TextDritte, werte: Record<string, string | number> = {}): string {
  return TEXTE_DRITTE[anrede][schluessel].replace(/\{([^{}]+)\}/g, (ganz, n: string) => (n in werte ? String(werte[n]) : ganz));
}

/** Vorschau in der Werkbank: derselbe Satz in beiden Formen. */
export const ANREDE_BEISPIEL: TextDritte = 'abruf.einleitung';
