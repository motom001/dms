/**
 * Kontextbezogene Hilfe (#110), Handbuch je Version (#111), offline im DMS (#219).
 *
 * Eine Tabelle: welche Stelle der Oberfläche auf welche Seite und welchen Abschnitt im Handbuch
 * zeigt. Die CI prüft gegen das gebaute Handbuch, dass jede Seite und jeder Anker existiert
 * (docs/handbuch/werkzeuge/hilfe-pruefen.ts) – eine umbenannte Überschrift fällt sofort auf.
 */

export const HANDBUCH_BASIS = 'https://motom001.github.io/dms';
export type Handbuch = 'admin' | 'benutzer';
export interface Hilfeziel { handbuch: Handbuch; /** Seite mit Schrägstrich am Ende, z. B. „aufgaben/“. */ seite: string; anker?: string; /** „Hilfe zu …“ */ titel: string }

const admin = (seite: string, titel: string, anker?: string): Hilfeziel => ({ handbuch: 'admin', seite, titel, anker });
const benutzer = (seite: string, titel: string, anker?: string): Hilfeziel => ({ handbuch: 'benutzer', seite, titel, anker });

export const HILFE = {
  // Werkbank: Bereiche
  // Einrichtungsassistent (#278): je Schritt der passende Abschnitt – immer online, s. hilfeOnlineUrl.
  'einrichtung.code': admin('installation/', 'Einrichtungscode', 'einrichtungscode'),
  'einrichtung.datenbank': admin('installation/', 'Datenbank', 'datenbank'),
  'einrichtung.wahl': admin('installation/', 'Neu einrichten oder wiederherstellen', 'neu-einrichten-oder-wiederherstellen'),
  'einrichtung.mandant': admin('installation/', 'Haushalt', 'haushalt'),
  'einrichtung.administrator': admin('installation/', 'Administrator', 'administrator'),
  'einrichtung.benutzer': admin('installation/', 'Erster Benutzer', 'erster-benutzer'),
  'einrichtung.schluessel': admin('installation/', 'Schlüssel und Notfallblatt', 'schlussel-und-notfallblatt'),
  'einrichtung.optional': admin('installation/', 'Optionales', 'optionales'),
  'einrichtung.fertig': admin('installation/', 'Fertig', 'fertig'),
  'werkbank.uebersicht': admin('uebersicht/', 'Übersicht', 'ubersicht'),
  'werkbank.ansicht': admin('uebersicht/', 'Werkbank anpassen', 'werkbank-anpassen'),
  'werkbank.typen': admin('mappentypen/', 'Mappentypen'),
  'werkbank.titelfilter': admin('mappentypen/', 'Platzhalter formatieren', 'platzhalter-formatieren'),
  'werkbank.sichten': admin('sichten/', 'Ansichten'),
  'werkbank.benutzer': admin('benutzer/', 'Benutzern und Rollen'),
  'werkbank.berechtigungen': admin('berechtigungen/', 'Berechtigungen'),
  'benutzer.wasSieht': admin('benutzer/', 'Was sieht ein Benutzer?', 'was-sieht-ein-benutzer'),
  'berechtigungen.grund': admin('berechtigungen/', 'Standard', 'standard'),
  'berechtigungen.regeln': admin('berechtigungen/', 'Regeln', 'regeln'),
  'berechtigungen.testlauf': admin('berechtigungen/', 'Testlauf', 'testlauf'),
  'werkbank.aufgaben': admin('aufgaben/', 'Aufgaben', 'tagliche-zusammenfassung'),
  'werkbank.betrieb': admin('installation/', 'E-Mail und Adresse', 'e-mail-und-adresse'),
  'werkbank.verschluesselung': admin('verschluesselung/', 'Verschlüsselung'),
  'werkbank.designs': admin('designs/', 'Designs'),
  'werkbank.papierkorb': admin('papierkorb/', 'Papierkorb'),
  'werkbank.texterkennung': admin('texterkennung/', 'Texterkennung'),
  'werkbank.texterkennung.sprachpakete': admin('texterkennung/', 'Sprachpakete nachinstallieren', 'sprachpakete-nachinstallieren'),
  'werkbank.eingangsordner': admin('eingangsordner/', 'Eingangsordner'),
  'werkbank.webdav': admin('webdav/', 'WebDAV-Laufwerk'),
  'werkbank.postfaecher': admin('postfaecher/', 'Postfächer'),
  'werkbank.postfaecher.oauth': admin('postfaecher/', 'Anmeldung mit OAuth', 'anmeldung-mit-oauth'),
  'werkbank.nummernkreise': admin('nummernkreise/', 'Nummernkreise'),
  'werkbank.pakete': admin('pakete/', 'Pakete'),
  'werkbank.pakete.erstellen': admin('pakete/', 'Paket aus deinem DMS erstellen', 'paket-aus-deinem-dms-erstellen'),
  // Rechte-Vorschau eines Pakets mit Code (#449): je Recht und je Ereignis ein Abschnitt.
  'pakete.recht.lesen': admin('pakete/', 'dem Recht „Mappen lesen“', 'recht-mappen-lesen'),
  'pakete.recht.schreiben': admin('pakete/', 'dem Recht „Mappen anlegen und ändern“', 'recht-mappen-anlegen-und-andern'),
  'pakete.recht.dokumente': admin('pakete/', 'den Rechten an Dokumenten', 'recht-dokumente'),
  'pakete.recht.netz': admin('pakete/', 'dem Zugriff auf Netzwerk und Internet', 'recht-netzwerk-und-internet'),
  'pakete.ereignisse': admin('pakete/', 'den Ereignissen für Pakete', 'ereignisse'),
  'pakete.ereignis.post_angelegt': admin('pakete/', 'dem Ereignis „Neue Post ist angelegt“', 'ereignis-post-angelegt'),
  'pakete.ereignis.dokument_hochgeladen': admin('pakete/', 'dem Ereignis „Ein Dokument wurde hochgeladen“', 'ereignis-dokument-hochgeladen'),
  'pakete.ereignis.texterkennung_fertig': admin('pakete/', 'dem Ereignis „Texterkennung fertig“', 'ereignis-texterkennung-fertig'),
  'pakete.ereignis.einstellungen_geaendert': admin('pakete/', 'dem Ereignis „Einstellungen geändert“', 'ereignis-einstellungen-geandert'),
  'mappentyp.archiv': admin('archiv/', 'Archivmodus und Aufbewahrung'),
  'werkbank.stempel': admin('stempel/', 'Stempel-Vorlagen'),
  'mappentyp.stempel': admin('stempel/', 'Stempel je Mappentyp', 'stempel-je-mappentyp'),
  'werkbank.vollexport': admin('export/', 'Daten exportieren'),
  'werkbank.vollexport.kontakte': admin('export/', 'Kontakte als vCard', 'kontakte-als-vcard'),
  'werkbank.darfweg': admin('archiv/', '„Darf weg“', 'nach-der-frist-darf-weg'),
  'werkbank.datenschutz': admin('datenschutz/', 'Datenschutz im DMS'),
  'werkbank.datenschutz.anrede': admin('datenschutz/', 'Anrede in Unterlagen für Dritte', 'anrede'),
  'werkbank.auskunft': admin('datenschutz/', 'Auskunft nach Art. 15 DSGVO', 'auskunft-nach-art-15-dsgvo'),
  'werkbank.auskunft.zustellen': admin('datenschutz/', 'Auskunft zustellen', 'auskunft-zustellen'),
  'werkbank.dateienpruefen': admin('archiv/', 'Alle Dateien prüfen', 'alle-dateien-prufen'),
  'werkbank.auswahlfilter': admin('mappentypen/', 'Auswahlfilter am Verweisfeld', 'auswahl-einschranken'),
  'werkbank.nummernkreise.nachtragen': admin('nummernkreise/', 'Nummern nachträglich vergeben', 'nummern-nachtraglich-vergeben'),
  'werkbank.aufkleber': admin('nummernkreise/', 'Aufkleber für Archivnummern', 'archivnummern-und-aufkleber'),
  'werkbank.anmeldeschutz': admin('anmeldeschutz/', 'Anmeldeschutz'),
  'werkbank.anbieter': admin('anmeldeschutz/', 'Anmeldung über einen Anbieter', 'anmeldung-uber-einen-anbieter-openid-connect'),
  'werkbank.zweifaktor': admin('anmeldeschutz/', 'Zwei-Faktor-Anmeldung', 'zwei-faktor-anmeldung'),
  'werkbank.wartung': admin('texterkennung/', 'Wartungsoperationen', 'wartungsoperationen'),
  'werkbank.wartung.absender': admin('texterkennung/', 'Absender bereinigen', 'absender-bereinigen'),
  'werkbank.protokoll': admin('fehlersuche/', 'Protokoll', 'protokoll'),
  'werkbank.fehlermeldungen': admin('fehlersuche/', 'Gemeldete Fehler', 'gemeldete-fehler'),
  'werkbank.datenbank': admin('installation/', 'Lange Datenbankzugriffe', 'lange-datenbankzugriffe'),
  'werkbank.technik': admin('fehlersuche/', 'Technik', 'technik'),
  'werkbank.demo': admin('demo/', 'Demo-Daten'),
  'werkbank.sicherung': admin('sicherung/', 'Sicherung'),
  'werkbank.wiederherstellung': admin('wiederherstellen/', 'Wiederherstellen'),
  'werkbank.wartungsmodus': admin('wartungsmodus/', 'Wartungsmodus'),
  'wartungsmodus.sofort': admin('wartungsmodus/', 'Jetzt sofort sperren', 'jetzt-sofort-sperren'),
  'werkbank.speicherplatz': admin('speicherplatz/', 'Systemzustand'),
  'werkbank.verkleinern': admin('speicherplatz/', 'Große PDFs verkleinern', 'grosse-pdfs-verkleinern'),
  'werkbank.anbindung': admin('installation/', 'der Datenbank-Anbindung', 'datenbank-anbindung'),
  // Werkbank: Zwischenüberschriften langer Seiten
  'mappentyp.felder': admin('mappentypen/', 'Feldern', 'felder'),
  'mappentyp.register': admin('mappentypen/', 'Registern', 'register'),
  'mappentyp.trefferlisten': admin('mappentypen/', 'Trefferlisten', 'trefferlisten'),
  'mappentyp.ziehen': admin('mappentypen/', 'Ziehen statt klicken', 'ziehen-statt-klicken'),
  'sicht.trefferliste': admin('sichten/', 'der Trefferliste einer Ansicht', 'trefferliste'),
  'sicht.bedingungen': admin('sichten/', 'Bedingungen', 'bedingungen'),
  'sicht.berechtigungen': admin('sichten/', 'Berechtigungen an Ansichten', 'berechtigungen'),
  'benutzer.abwesenheit': admin('benutzer/', 'Abwesenheit', 'abwesenheit'),
  'benutzer.sperren': admin('benutzer/', 'Zugang sperren', 'zugang-sperren'),
  'verschluesselung.schluessel': admin('verschluesselung/', 'Schlüssel', 'schlussel-erzeugen'),
  'verschluesselung.wechseln': admin('verschluesselung/', 'Schlüssel wechseln', 'schlussel-wechseln'),
  'verschluesselung.arten': admin('verschluesselung/', 'Was verschlüsselt ist', 'was-verschlusselt-ist'),
  'sicherung.zeitplan': admin('sicherung/', 'Zeitplan und Aufbewahrung', 'zeitplan-und-aufbewahrung'),
  'sicherung.speicher': admin('sicherung/', 'Speicherplatz', 'speicherplatz'),
  'sicherung.ort': admin('sicherung/', 'Speicherort', 'speicherort'),
  'sicherung.notfallblatt': admin('sicherung/', 'Notfallblatt', 'notfallblatt'),
  'sicherung.probe': admin('wiederherstellen/', 'Probe-Wiederherstellung', 'probe-wiederherstellung'),
  // Ablage und Profil: Benutzerhandbuch
  'ablage.eingang': benutzer('eingang/', 'Zu erledigen und Aufgaben'),
  'ablage.start': benutzer('startseite/', 'Startseite'),
  'profil.laufwerk': benutzer('laufwerk/', 'Als Laufwerk einbinden'),
  'stempel.weitergeben': benutzer('versenden/', 'Weitergeben mit Stempel', 'weitergeben-mit-stempel'),
  'ablage.email': benutzer('versenden/', 'mehreren Mappen per E-Mail', 'mehrere-mappen-per-e-mail'),
  'ablage.anstehend': benutzer('eingang/', 'Anstehend', 'anstehend'),
  'ablage.erinnern': benutzer('eingang/', 'Erinnern', 'erinnern'),
  'mappentyp.frist': admin('mappentypen/', 'Erinnerungen an Datumsfeldern', 'fristen-erinnerungen-an-datumsfeldern'),
  'ablage.favoriten': benutzer('ablage/', 'Favoriten', 'favoriten'),
  'ablage.papierkorb': benutzer('ablage/', 'Papierkorb', 'papierkorb'),
  'mappe.mitVerknuepften': benutzer('mappen/', 'Mit verknüpften Mappen löschen', 'mit-verknupften-mappen-loschen'),
  'ablage.sicht': benutzer('ablage/', 'Ansichten und Listen', 'die-liste'),
  'ablage.erweitertesuche': benutzer('ablage/', 'Erweiterte Suche', 'erweiterte-suche'),
  'ablage.suchvolltext': benutzer('ablage/', 'Volltext in der erweiterten Suche', 'volltext-in-dokumenten-und-notizen'),
  'ablage.post': benutzer('post/', 'Post'),
  'post.zuordnen': benutzer('post/', 'Zuordnen', 'zuordnen'),
  'dokumente.sortieren': benutzer('dokumente/', 'Sortieren von Dokumenten', 'sortieren'),
  'dokumente.mehrere': benutzer('dokumente/', 'mehreren Dokumenten auf einmal', 'mehrere-auf-einmal'),
  'dokumente.versionen': benutzer('versionen/', 'Versionen verstehen'),
  'dokumente.seiten': benutzer('dokumente/', 'PDF bearbeiten', 'pdf-bearbeiten'),
  'dokumente.verkleinern': benutzer('dokumente/', 'PDF verkleinern', 'pdf-verkleinern'),
  'dokumente.schwaerzen': benutzer('dokumente/', 'Schwärzen', 'schwaerzen'),
  'versenden.verkleinert': benutzer('versenden/', 'Verkleinert weitergeben', 'verkleinert-weitergeben'),
  'dokumente.archivnummer': benutzer('dokumente/', 'Archivnummer', 'archivnummer'),
  'profil.rechte': benutzer('profil/', 'deinen Rechten', 'meine-rechte'),
  'profil.abwesenheit': benutzer('profil/', 'Abwesenheit', 'abwesenheit'),
  'profil.export': benutzer('profil/', 'Meine Daten exportieren', 'meine-daten-exportieren'),
  'profil.zweifaktor': benutzer('profil/', 'Zwei-Faktor-Anmeldung', 'zwei-faktor-anmeldung'),
  'profil.benachrichtigungen': benutzer('profil/', 'Benachrichtigungen', 'benachrichtigungen'),
  'profil.favoriten': benutzer('ablage/', 'Favoriten als Abo', 'favoriten-als-abo'),
} as const satisfies Record<string, Hilfeziel>;
export type Hilfeort = keyof typeof HILFE;

/**
 * Ordner der Version im Handbuch: „v0.22“ für 0.22.x; sonst (Entwicklung, unbekannt) „aktuell“.
 * Gibt es die Version dort (noch) nicht, leitet die 404-Seite des Handbuchs auf „aktuell“ um.
 */
export function handbuchVersion(version: string | null | undefined): string {
  const m = /^(\d+)\.(\d+)\.\d+$/.exec(version ?? '');
  return m ? `v${m[1]}.${m[2]}` : 'aktuell';
}

/**
 * Handbuch im DMS selbst (#219): Das Image bringt die Handbücher seiner Version mit, ohne Internet
 * lesbar unter /hilfe/. Ohne gebaute Handbücher (Entwicklung) leitet der Server auf die Online-Fassung um.
 */
export function handbuchUrl(handbuch: Handbuch, _version: string | null | undefined, seite = ''): string {
  return `/hilfe/${handbuch}/${seite}`;
}

/** Dieselbe Seite online auf GitHub Pages, passend zur Version. */
export function handbuchOnlineUrl(handbuch: Handbuch, version: string | null | undefined, seite = ''): string {
  return `${HANDBUCH_BASIS}/${handbuch}/${handbuchVersion(version)}/${seite}`;
}

/**
 * Hilfe im Einrichtungsassistenten (#278): immer das Online-Handbuch der aktuellen Version –
 * ob ein lokales Handbuch erreichbar ist, steht dort noch nicht fest.
 */
export function hilfeOnlineUrl(ziel: Hilfeziel): string {
  return `${handbuchOnlineUrl(ziel.handbuch, null, ziel.seite)}${ziel.anker ? `#${ziel.anker}` : ''}`;
}
/** Anleitungen je Plattform: „Wie komme ich an ein DMS?“ */
export const INSTALLIEREN_URL = `${HANDBUCH_BASIS}/installieren/aktuell/`;

export function hilfeUrl(ziel: Hilfeziel, version: string | null | undefined): string {
  return `${handbuchUrl(ziel.handbuch, version, ziel.seite)}${ziel.anker ? `#${ziel.anker}` : ''}`;
}

export const HANDBUCH_NAME: Record<Handbuch, string> = { admin: 'Administratorhandbuch', benutzer: 'Benutzerhandbuch' };
