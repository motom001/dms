import type { Zufall } from './zufall';

/**
 * Deutscher Wortschatz für Demo-Dokumente (#248): Haushaltsbegriffe, zu plausiblen Sätzen
 * zusammengesetzt. Zusammengesetzte Wörter (Kündigungsfrist, Selbstbeteiligung …) sind
 * Absicht – die Volltextsuche soll auch Wortteile finden (#161).
 */

export const NACHNAMEN = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler'];
export const VORNAMEN = ['Anna', 'Lena', 'Marie', 'Sophie', 'Lea', 'Thomas', 'Michael', 'Andreas', 'Stefan', 'Jan', 'Lukas', 'Paul', 'Sabine', 'Petra', 'Katrin', 'Frank', 'Jörg', 'Uwe', 'Heike', 'Claudia'];
export const ORTE = ['Dresden', 'Leipzig', 'Chemnitz', 'Pirna', 'Meißen', 'Radebeul', 'Freital', 'Bautzen', 'Görlitz', 'Zwickau', 'Riesa', 'Kamenz'];
export const STRASSEN = ['Hauptstraße', 'Bahnhofstraße', 'Gartenweg', 'Lindenallee', 'Schulstraße', 'Bergstraße', 'Am Markt', 'Waldweg'];

const GEGENSTAENDE = ['Backofen', 'Geschirrspüler', 'Waschmaschine', 'Kühlschrank', 'Wärmepumpe', 'Gasheizung', 'Photovoltaikanlage', 'Wallbox', 'Fernseher', 'Laptop', 'Kaffeevollautomat', 'Rasenmäher', 'Fahrradträger', 'Dunstabzugshaube', 'Trockner', 'Rauchmelder', 'Markise', 'Garagentor'];
const LEISTUNGEN = ['Wartung', 'Reparatur', 'Inspektion', 'Montage', 'Lieferung', 'Anfahrt', 'Ersatzteil', 'Prüfung', 'Reinigung', 'Abrechnung', 'Ablesung', 'Schornsteinfegerarbeiten'];
const VERTRAGSWOERTER = ['Kündigungsfrist', 'Selbstbeteiligung', 'Vertragslaufzeit', 'Mindestlaufzeit', 'Beitragsanpassung', 'Abschlagszahlung', 'Jahresabrechnung', 'Haftpflichtversicherung', 'Hausratversicherung', 'Gewährleistung', 'Garantieverlängerung', 'Lastschriftmandat', 'Zählerstand', 'Grundgebühr', 'Arbeitspreis', 'Nebenkostenabrechnung', 'Mietkaution', 'Wohngebäudeversicherung', 'Rechtsschutzversicherung', 'Sonderkündigungsrecht'];
const VERBEN = ['bestätigen', 'berechnen', 'erstatten', 'verlängern', 'kündigen', 'prüfen', 'übernehmen', 'anpassen', 'abbuchen', 'zusenden'];
const ZEITEN = ['zum Monatsende', 'zum Ende der Vertragslaufzeit', 'innerhalb von 14 Tagen', 'bis zum 31. Dezember', 'ab dem nächsten Abrechnungszeitraum', 'mit sofortiger Wirkung', 'nach Eingang der Unterlagen'];
const ADJEKTIVE = ['vereinbarte', 'monatliche', 'jährliche', 'anteilige', 'vorläufige', 'endgültige', 'gesetzliche', 'vertragliche'];

const SATZVORLAGEN: Array<(z: Zufall) => string> = [
  (z) => `Hiermit ${z.eins(['bestätigen', 'berechnen', 'übersenden'])} wir Ihnen die ${z.eins(ADJEKTIVE)} ${z.eins(VERTRAGSWOERTER)} für Ihren ${z.eins(GEGENSTAENDE)}.`,
  (z) => `Die ${z.eins(VERTRAGSWOERTER)} beträgt ${z.von(1, 12)} Monate und endet ${z.eins(ZEITEN)}.`,
  (z) => `Für die ${z.eins(LEISTUNGEN)} am ${z.eins(GEGENSTAENDE)} fallen ${z.von(2, 480)},${String(z.int(100)).padStart(2, '0')} Euro an.`,
  (z) => `Bitte ${z.eins(VERBEN)} Sie den Betrag ${z.eins(ZEITEN)}.`,
  (z) => `Eine ${z.eins(VERTRAGSWOERTER)} von ${z.von(50, 1000)} Euro wird ${z.eins(['angerechnet', 'nicht erhoben', 'vom Erstattungsbetrag abgezogen'])}.`,
  (z) => `Wir weisen darauf hin, dass die ${z.eins(ADJEKTIVE)} ${z.eins(VERTRAGSWOERTER)} ${z.eins(ZEITEN)} gilt.`,
  (z) => `Der ${z.eins(GEGENSTAENDE)} wurde ${z.eins(['geprüft', 'gereinigt', 'instand gesetzt', 'ausgetauscht', 'neu eingestellt'])}; die ${z.eins(LEISTUNGEN)} ist abgeschlossen.`,
  (z) => `Bei Rückfragen erreichen Sie uns ${z.eins(['werktags von 8 bis 18 Uhr', 'unter der angegebenen Telefonnummer', 'per E-Mail', 'im Kundenportal'])}.`,
  (z) => `Ihr ${z.eins(['Zählerstand', 'Verbrauch', 'Guthaben', 'Saldo'])} zum Stichtag beträgt ${z.von(100, 99999).toLocaleString('de-DE')}.`,
  (z) => `Ein ${z.eins(['Sonderkündigungsrecht', 'Widerrufsrecht', 'Anspruch auf Erstattung'])} besteht ${z.eins(ZEITEN)}.`,
];

export const satz = (z: Zufall) => z.eins(SATZVORLAGEN)(z);
export const absatz = (z: Zufall, saetze = z.von(2, 6)) => Array.from({ length: saetze }, () => satz(z)).join(' ');
export const ueberschrift = (z: Zufall) => `${z.eins(['Hinweise zur', 'Angaben zur', 'Übersicht der', 'Regelungen zur', 'Fragen zur'])} ${z.eins(VERTRAGSWOERTER)}`;
export const position = (z: Zufall) => `${z.eins(LEISTUNGEN)} ${z.eins(GEGENSTAENDE)}`;
export const person = (z: Zufall) => `${z.eins(VORNAMEN)} ${z.eins(NACHNAMEN)}`;
export const anschrift = (z: Zufall) => `${z.eins(STRASSEN)} ${z.von(1, 120)}, 0${z.von(1000, 9999)} ${z.eins(ORTE)}`;
export const euro = (x: number) => `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
