/**
 * Welche Schnittstelle gehört zu welchem Werkbank-Bereich (#818)? Server und Oberfläche prüfen gleich: Eine Route der
 * Werkbank ohne Recht auf ihren Bereich ist nicht erreichbar, auch nicht über die API.
 *
 * Jede Route mit `zugang: 'admin'` ist hier einem oder mehreren Bereichen aus `BEREICHE` zugeordnet (mehrere, wenn
 * verschiedene Seiten dieselbe Liste lesen). `JEDER` = jeder, der verwalten darf (Übersicht, eigene Leiste, laufende
 * Aufträge, Namen der Rollen). Eine Route ohne Zuordnung dürfen nur Personen mit „Gesamte Verwaltung“ – Vorgabe
 * „nein“; ein Test schlägt fehl, wenn eine Route keinen Eintrag hat.
 *
 * Dazu die heikelsten Handlungen (#819, Frage 7 von Sicherheit): Sie brauchen immer eine frische Anmeldung.
 */
import type { HeikleHandlung } from '../../shared/src/verwaltungsrecht';

/** Jeder, der verwalten darf. */
export const JEDER = 'uebersicht';
/** Nur „Gesamte Verwaltung“ (ausdrücklich, damit der Test die Route als zugeordnet kennt). */
export const NUR_GESAMT = '*';

type Methode = 'GET' | 'POST' | 'PUT' | 'DELETE';
/** [Methode oder „alle“, Pfad oder Anfang mit „*“ am Ende, Bereiche] – der erste passende Eintrag gilt. */
type Regel = [Methode | '*', string, string[]];

const R = (m: Methode | '*', p: string, ...b: string[]): Regel => [m, p, b];

const REGELN: Regel[] = [
  // Für alle, die verwalten: Übersicht, eigene Leiste (die Vorlage für alle nur „Gesamte Verwaltung“), laufende
  // Aufträge (Zeile oben), Namen der Rollen.
  R('*', '/api/werkbank/uebersicht*', JEDER),
  R('GET', '/api/werkbank/ansicht', JEDER),
  R('PUT', '/api/werkbank/ansicht', NUR_GESAMT),
  // Merkmale der Ablage (#1032): lesen alle, die verwalten (Werkbank → Nutzung); ändern nur „Gesamte Verwaltung“.
  R('GET', '/api/werkbank/merkmale', JEDER),
  R('PUT', '/api/werkbank/merkmale', NUR_GESAMT),
  R('*', '/api/werkbank/auftrag*', JEDER),
  R('GET', '/api/rollen', JEDER),
  // Wer gerade auch im Verwaltungsmodus ist (#921): Hinweis oben in der Werkbank für alle im Modus.
  R('GET', '/api/werkbank/gerade-im-modus', JEDER),
  // Einrichtungsassistent und Liste „Im Verwaltungsmodus angesehen“ (#820): nur Gesamte Verwaltung.
  R('*', '/api/werkbank/einrichtung*', NUR_GESAMT),
  R('*', '/api/werkbank/verwaltungsmodus*', NUR_GESAMT),

  // Ablage aufbauen
  R('*', '/api/werkbank/pakete*', 'pakete'),
  R('*', '/api/typen*', 'typen'),
  R('*', '/api/werkbank/berechtigungen*', 'typen'),
  // KI-Dienste (#796): am Mappentyp und auf der Seite eines KI-Pakets.
  R('*', '/api/werkbank/ki-typen*', 'pakete', 'typen'),
  R('*', '/api/werkbank/archiv/vorschau', 'typen'),
  R('GET', '/api/werkbank/erkennung', 'typen', 'texterkennung', 'pakete'),
  R('*', '/api/sichten/*', 'sichten'),
  R('*', '/api/werkbank/sichten/testlauf', 'sichten'),
  R('*', '/api/werkbank/auswahlfilter/zaehlen', 'sichten'),
  R('*', '/api/werkbank/nummernkreise*', 'nummernkreise'),
  R('*', '/api/werkbank/archivnummern/*', 'nummernkreise'),
  R('*', '/api/werkbank/automatisierungen*', 'automatisierungen'),
  // Automatisierungsvorlagen (#1044) und angehaltene Mappen-Abläufe fortsetzen.
  R('*', '/api/werkbank/ablaufvorlagen*', 'ablaufvorlagen'),
  R('*', '/api/werkbank/ablaeufe*', 'ablaufvorlagen'),

  // Benutzer und Sicherheit – die Liste der Benutzer lesen auch die Testläufe der Rechte (Typen, Ansichten) und die
  // Automatisierungen; Verwaltungsrechte selbst vergibt nur „Gesamte Verwaltung“ (prüft konten.setzeVerwaltung).
  R('GET', '/api/benutzer', 'benutzer', 'typen', 'sichten', 'automatisierungen', 'aufgaben'),
  R('GET', '/api/benutzer/systemkonten', 'benutzer', 'typen', 'sichten', 'automatisierungen'),
  R('*', '/api/benutzer*', 'benutzer'),
  R('*', '/api/werkbank/aufgaben-empfaenger', 'benutzer', 'aufgaben'),
  R('*', '/api/werkbank/tresor*', 'verschluesselung'),
  // Das Notfallblatt trägt den Schlüssel aller Sicherungen: nur, wer die Verschlüsselung verwaltet (#993, Thomas 10.11.2026).
  R('GET', '/api/werkbank/notfallblatt', 'verschluesselung'),
  // Notfallkontakte (#812, Durchsicht Sicherheit): gehören zum Notfallblatt; wer sie pflegt, verschickt Mails im Namen der Ablage.
  R('*', '/api/werkbank/notfallkontakte*', 'verschluesselung'),
  R('GET', '/api/werkbank/datenschutz', 'auskuenfte', 'loeschkonzept'),
  R('*', '/api/werkbank/datenschutz*', 'auskuenfte', 'loeschkonzept'),
  R('*', '/api/werkbank/auskunft*', 'auskuenfte'),
  R('*', '/api/werkbank/loeschprotokoll*', 'loeschkonzept'),
  // Eigene Organisation (#995): Verweis auf die Mappe, Rollen für das Merkmal, Notizen.
  R('*', '/api/werkbank/organisation*', 'organisation'),
  R('*', '/api/werkbank/darf-weg', 'aufbewahrung'),
  R('*', '/api/werkbank/stempel/*', 'stempel'),

  // Post und Eingänge
  R('*', '/api/werkbank/postfaecher*', 'postfaecher'),
  R('*', '/api/werkbank/eingangsordner*', 'eingangsordner'),
  R('*', '/api/werkbank/webdav', 'webdav'),
  R('*', '/api/werkbank/texterkennung*', 'texterkennung', 'wartung'),
  // Gleichbedeutende Wörter (#992): eigener Bereich; den Stand der Suche (mit den Gruppen) lesen beide Seiten.
  R('*', '/api/werkbank/suche/synonyme*', 'woerter'),
  R('GET', '/api/werkbank/suche', 'texterkennung', 'woerter'),
  R('*', '/api/werkbank/suche*', 'texterkennung'),
  R('*', '/api/werkbank/vektoren*', 'texterkennung'),
  R('*', '/api/werkbank/verkleinern*', 'texterkennung'),
  R('*', '/api/werkbank/erkennung', 'texterkennung', 'pakete'),
  R('*', '/api/werkbank/fragen', 'texterkennung', 'pakete'),

  // Daten sichern
  R('*', '/api/werkbank/sicherung*', 'sicherung'),
  R('*', '/api/werkbank/export*', 'vollexport'),
  R('*', '/api/werkbank/papierkorb*', 'papierkorb'),

  // Einstellungen
  R('*', '/api/werkbank/betrieb*', 'betrieb'),
  R('*', '/api/werkbank/region', 'region'),
  R('*', '/api/werkbank/sprachen', 'sprachen'),
  R('*', '/api/werkbank/uebersetzen', 'sprachen'),
  R('*', '/api/werkbank/aufgaben*', 'aufgaben'),
  R('*', '/api/werkbank/anmeldeschutz*', 'anmeldeschutz'),
  R('*', '/api/werkbank/zweifaktor', 'anmeldeschutz'),
  R('*', '/api/werkbank/passkeys', 'anmeldeschutz'),
  R('*', '/api/werkbank/anbieter*', 'anmeldeschutz'),
  R('*', '/api/designs*', 'designs'),
  R('*', '/api/werkbank/anbindung*', 'anbindung'),
  R('*', '/api/werkbank/neustart', 'anbindung'),

  // Wartung und Fehlersuche
  R('*', '/api/werkbank/system*', 'systemzustand'),
  R('*', '/api/werkbank/speicherplatz', 'systemzustand'),
  R('*', '/api/werkbank/datenbank', 'systemzustand'),
  R('*', '/api/werkbank/last*', 'systemzustand'),
  R('*', '/api/werkbank/protokoll', 'protokoll'),
  R('*', '/api/werkbank/debug', 'protokoll'),
  R('*', '/api/werkbank/fehlermeldungen*', 'fehlermeldungen'),
  R('*', '/api/werkbank/wartung*', 'wartung'),
  R('*', '/api/werkbank/demo*', 'demo'),
  R('*', '/api/beispiele', 'demo'),
];

const passt = (muster: string, pfad: string) => (muster.endsWith('*') ? pfad.startsWith(muster.slice(0, -1)) : pfad === muster);

/** Bereiche einer Route der Werkbank; `null` = nicht zugeordnet (dann nur „Gesamte Verwaltung“). */
export function bereicheDerRoute(methode: string, pfad: string): string[] | null {
  for (const [m, p, b] of REGELN) if ((m === '*' || m === methode) && passt(p, pfad)) return b;
  return null;
}

const UMBAU_ROUTEN = new Set(['POST /api/werkbank/pakete/installieren', 'POST /api/werkbank/pakete/:id/aktualisieren']);
const umbauHandlung = (body: unknown): HeikleHandlung | null => ((body as { umbauBestaetigt?: unknown } | null)?.umbauBestaetigt === true ? 'rechte' : null);

/** Heikle Handlungen ohne Bedingung am Körper der Anfrage: Methode und Pfad der Route genügen. */
const HEIKEL: Record<string, HeikleHandlung> = {
  'PUT /api/benutzer/:id/verwaltung': 'rechte',
  // Anmeldemittel einer Person entfernen (#811, Durchsicht Sicherheit): Wer kurz an einem fremden Gerät sitzt, soll das nicht können.
  'POST /api/benutzer/:id/zweifaktor/zuruecksetzen': 'anmeldung',
  'POST /api/benutzer/:id/passkeys/zuruecksetzen': 'anmeldung',
  'GET /api/werkbank/notfallblatt': 'schluessel',
  'POST /api/werkbank/tresor/erzeugen': 'schluessel',
  'POST /api/werkbank/tresor/wechseln': 'schluessel',
  // Sicherung herunterladen (#975): die ganze Ablage, verschlüsselt – mit dem Notfallblatt lesbar.
  'GET /api/werkbank/sicherung/:name/datei': 'sicherung',
  'PUT /api/werkbank/anbindung': 'anbindung',
  'PUT /api/werkbank/anbieter': 'anbieter',
  'PUT /api/werkbank/betrieb/mail': 'mailversand',
  // Versand über OAuth (#813): anmelden bzw. abmelden ändert, womit Ablago verschickt.
  'POST /api/werkbank/betrieb/mail/oauth/start': 'mailversand',
  'POST /api/werkbank/betrieb/mail/oauth/geraet': 'mailversand',
  'POST /api/werkbank/betrieb/mail/oauth/abmelden': 'mailversand',
};

/**
 * Heikle Handlung dieser Anfrage (#819)? Dann braucht sie eine frische Anmeldung – auch im Verwaltungsmodus mit
 * Tagesmerker. Der Vollexport nur mit Passwörtern im Klartext, der Notfallzugang (#815) nur beim Erlauben aus dem
 * Internet. Das Wiederherstellen prüfen die eigenen Schnittstellen unter /api/wiederherstellung (sie gehen auch ohne
 * Anmeldung auf einem frischen System).
 */
export function heikleHandlung(methode: string, pfad: string, body: unknown): HeikleHandlung | null {
  const k = `${methode} ${pfad}`;
  // Paket-Umbau (#1041): Mappen wechseln den Typ und damit Rechte – nur mit frischer Anmeldung bestätigen.
  if (UMBAU_ROUTEN.has(k)) return umbauHandlung(body);
  if (Object.hasOwn(HEIKEL, k)) return HEIKEL[k];
  switch (k) {
    case 'POST /api/werkbank/export': return (body as { passwoerter?: unknown } | null)?.passwoerter === true ? 'vollexport' : null;
    // Notfallzugang aus dem Internet erlauben (#815); zurück auf „nur Heimnetz“ geht ohne.
    case 'PUT /api/werkbank/anmeldeschutz/notfallzugang': return (body as { internet?: unknown } | null)?.internet === true ? 'notfall' : null;
    default: return null;
  }
}
