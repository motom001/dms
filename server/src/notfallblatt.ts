import { pdfAus, type Absatz } from './pdf';

/**
 * Notfallblatt (#106): alles, um das DMS samt Sicherung auf einem neuen System wiederherzustellen.
 * Der Schlüssel steht nur hier (und in der Schlüsseldatei), nie in einer Sicherung.
 */

export interface Notfalldaten {
  name: string;
  haushaltId: string;
  adresse: string;
  version: string;
  erstellt: Date;
  /** Schlüssel als Text (base64url, 43 Zeichen). */
  schluessel: string;
  fingerabdruck: string;
  /** Sicherungsordner im Container. */
  sicherungsordner: string;
  /** Ordner der Schlüsseldatei im Container. */
  schluesselordner: string;
}

/** In Vierergruppen, gut abschreibbar; Leerzeichen zählen bei der Eingabe nicht. */
export const inGruppen = (s: string) => s.match(/.{1,4}/g)!.join(' ');

export function notfallblatt(d: Notfalldaten): Buffer {
  const datum = d.erstellt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'short' });
  const zeile = (text: string, x: Partial<Absatz> = {}): Absatz => ({ text, ...x });
  const absaetze: Absatz[] = [
    zeile(`Notfallblatt – ${d.name}`, { schrift: 'fett', groesse: 18 }),
    zeile(`Erstellt am ${datum} · DMS ${d.version}`, { abstand: 2 }),
    zeile('Bewahre dieses Blatt sicher auf – in einem Passwortsafe oder ausgedruckt an einem sicheren Ort, getrennt vom NAS. Wer es hat, kann deine Sicherungen lesen. Ohne den Schlüssel darauf ist keine Sicherung wiederherstellbar.', { abstand: 10 }),

    zeile('Schlüssel', { schrift: 'fett', groesse: 13, abstand: 16 }),
    zeile(inGruppen(d.schluessel), { schrift: 'mono', groesse: 14, abstand: 6 }),
    zeile(`Fingerabdruck: ${d.fingerabdruck}`, { abstand: 6 }),
    zeile('Groß- und Kleinschreibung zählen; die Leerzeichen zwischen den Gruppen nicht. Mögliche Zeichen: A–Z, a–z, 0–9, - und _.', { groesse: 9 }),

    zeile('Dieses DMS', { schrift: 'fett', groesse: 13, abstand: 16 }),
    zeile(`Mandanten-Id: ${d.haushaltId}`, { abstand: 4 }),
    zeile(`Adresse: ${d.adresse || '–'}`),
    zeile(`Sicherungen: Ordner ${d.sicherungsordner} im Container (in der Vorlage /volume1/docker/dms/sicherung auf dem NAS)`),
    zeile(`Schlüsseldatei: Ordner ${d.schluesselordner} im Container (in der Vorlage /volume1/docker/dms/geheim)`),
    zeile('Das Passwort der Datenbank steht in der Datei .env neben der docker-compose.yml – bewusst nicht auf diesem Blatt. Für ein neues System genügt ein neues Passwort.'),

    zeile('Wiederherstellen auf einem neuen System', { schrift: 'fett', groesse: 13, abstand: 16 }),
    zeile('1. Auf dem neuen NAS die Ordner postgres, files, geheim und sicherung anlegen.', { abstand: 4 }),
    zeile('2. Die Vorlage deploy/nas/docker-compose.yml von github.com/motom001/dms als Compose-Projekt anlegen, Pfade anpassen und daneben eine .env mit DB_PASSWORD=<neues langes Passwort> ablegen.', { einzug: 0 }),
    zeile(`3. Die Sicherung – beide Dateien, .dms-sicherung und .json – in den Ordner sicherung kopieren.`),
    zeile('4. Das DMS starten und im Browser öffnen. Der Einrichtungsassistent fragt nach dem Einrichtungscode (steht im Protokoll des Containers und in der Datei geheim/EINRICHTUNGSCODE). Dann „Aus einer Sicherung wiederherstellen“ wählen, die Sicherung auswählen und den Schlüssel von diesem Blatt eingeben.'),
    zeile('5. Nach der Wiederherstellung startet das DMS neu; danach meldest du dich mit deinen bisherigen Zugangsdaten an.'),
    zeile('Die Mandanten-Id übernimmt das DMS beim Wiederherstellen aus der Sicherung.', { abstand: 6 }),
    zeile(`Startet das DMS nicht mehr (z. B. nach einem Update), trage in der Compose-Datei ein älteres Image ein, etwa ghcr.io/motom001/dms:${d.version}, und starte neu.`),
    zeile('Kommt kein Administrator mehr hinein: im Ordner geheim eine Datei RESCUE mit dem Inhalt NOTFALLZUGANG anlegen (siehe Administratorhandbuch, „Notfall: kein Admin mehr“).'),

    zeile('Ausführlich im Administratorhandbuch: motom001.github.io/dms/admin/ (Kapitel Sicherung und Wiederherstellen)', { abstand: 16, groesse: 9 }),
  ];
  return pdfAus(absaetze, `Notfallblatt ${d.name}`);
}
