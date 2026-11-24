/**
 * Welche Schnittstelle gehört zu welchem Werkbank-Bereich (#818)? Server und Oberfläche prüfen gleich: Eine Route der
 * Werkbank ohne Recht auf ihren Bereich ist nicht erreichbar, auch nicht über die API.
 *
 * Jede Route mit `zugang: 'admin'` ist hier einem oder mehreren Bereichen aus der Liste der Werkbank-Seiten zugeordnet
 * (`shared/src/werkbankansicht.ts`, #1281; mehrere, wenn verschiedene Seiten dieselbe Liste lesen). Die Namen prüft tsc
 * gegen die Liste (`Bereichskennung`), ein Test, dass jede Seite der Liste mindestens eine Route hat. `JEDER` = jeder, der verwalten darf (Übersicht, eigene Leiste, laufende
 * Aufträge, Namen der Rollen). Eine Route ohne Zuordnung dürfen nur Personen mit „Gesamte Verwaltung“ – Vorgabe
 * „nein“; ein Test schlägt fehl, wenn eine Route keinen Eintrag hat.
 *
 * Dazu die heikelsten Handlungen (#819, Frage 7 von Sicherheit): Sie brauchen immer eine frische Anmeldung.
 */
import type { HeikleHandlung } from '../../../shared/src/verwaltungsrecht';
import { brauchtFrisch, istPaketdatenBereich, type PaketdatenArt } from '../../../shared/src/paketdaten';
import { seitenRecht, type Bereichskennung } from '../../../shared/src/werkbankansicht';

/** Jeder, der verwalten darf. */
export const JEDER = 'uebersicht';
/** Nur „Gesamte Verwaltung“ (ausdrücklich, damit der Test die Route als zugeordnet kennt). */
export const NUR_GESAMT = '*';

type Methode = 'GET' | 'POST' | 'PUT' | 'DELETE';
/** Ein Bereich aus der Liste der Werkbank-Seiten, `JEDER` oder `NUR_GESAMT`. */
type Bereich = Bereichskennung | typeof JEDER | typeof NUR_GESAMT;
/** [Methode oder „alle“, Pfad oder Anfang mit „*“ am Ende, Bereiche] – der erste passende Eintrag gilt. */
type Regel = [Methode | '*', string, string[]];

const R = (m: Methode | '*', p: string, ...b: Bereich[]): Regel => [m, p, b];
/** Regel für die Schnittstellen einer Seite, deren Recht auch andere Bereiche geben (`auchMit` in der Liste). */
const S = (m: Methode | '*', p: string, seite: Bereichskennung): Regel => [m, p, seitenRecht(seite)];

const REGELN: Regel[] = [
  // Für alle, die verwalten: Übersicht, eigene Leiste (die Vorlage für alle nur „Gesamte Verwaltung“), laufende
  // Aufträge (Zeile oben), Namen der Rollen.
  R('*', '/api/werkbank/uebersicht*', JEDER),
  R('GET', '/api/werkbank/ansicht', JEDER),
  R('PUT', '/api/werkbank/ansicht', NUR_GESAMT),
  // Merkmale der Ablage (#1032): lesen alle, die verwalten (Werkbank → Nutzung); ändern nur „Gesamte Verwaltung“.
  R('GET', '/api/werkbank/merkmale', JEDER),
  R('PUT', '/api/werkbank/merkmale', NUR_GESAMT),
  // Was Ablago darf (#1562): lesen alle, die verwalten (Karte der Übersicht); ändern nur „Gesamte Verwaltung“.
  R('GET', '/api/werkbank/darf', JEDER),
  R('PUT', '/api/werkbank/darf', NUR_GESAMT),
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
  // Rundgänge (#941).
  R('*', '/api/werkbank/rundgaenge*', 'rundgaenge'),
  // Tipps (#942).
  R('*', '/api/werkbank/tipps*', 'tipps'),
  // Gelöschte Einträge mit ihrer letzten Fassung (#1006): wer einen der Bereiche verwaltet – die Liste zeigt nur dessen Einträge.
  R(
    'GET',
    '/api/werkbank/fassungen/geloescht',
    'typen',
    'sichten',
    'nummernkreise',
    'stempel',
    'postfaecher',
    'pakete',
    'automatisierungen',
    'ablaufvorlagen',
  ),

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
  // Löschprotokoll (#1184): eigener Bereich; wer das Löschkonzept verwaltet, behält es (`auchMit` in der Liste).
  S('*', '/api/werkbank/loeschprotokoll*', 'loeschprotokoll'),
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
  // Die Wörter allein liest auch der Editor einer Ansicht (#1548: Suche in der Symbolauswahl).
  R('GET', '/api/werkbank/suche/synonyme', 'woerter', 'sichten'),
  R('*', '/api/werkbank/suche/synonyme*', 'woerter'),
  R('GET', '/api/werkbank/suche', 'texterkennung', 'woerter'),
  R('*', '/api/werkbank/suche*', 'texterkennung'),
  R('*', '/api/werkbank/vektoren*', 'texterkennung'),
  R('*', '/api/werkbank/verkleinern*', 'texterkennung'),
  R('*', '/api/werkbank/erkennung', 'texterkennung', 'pakete'),
  R('*', '/api/werkbank/fragen', 'texterkennung', 'pakete'),

  // Papierkorb und Export (#1196, #1197): dauerhafte Einstellungen unter Einstellungen – vor den Regeln der Seiten,
  // von denen sie dorthin umgezogen sind.
  R('GET', '/api/werkbank/daten', 'daten'),
  R('PUT', '/api/werkbank/export/persoenlich', 'daten'),
  R('PUT', '/api/werkbank/papierkorb/einstellungen', 'daten'),
  // Aufbewahrung abgeschlossener Aufträge an Leistungen (#1569).
  R('*', '/api/werkbank/leistungen/einstellungen', 'daten'),

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
  // Beispiel-Ablage (#988): legt Beispiel-Mappen der installierten Pakete an und entfernt sie.
  R('*', '/api/werkbank/beispielablage*', 'beispielablage'),
  R('*', '/api/beispiele', 'demo'),
];

/** Bereiche, denen mindestens eine Route zugeordnet ist (für den Test: jede Seite der Liste hat eine). */
export const bereicheMitRoute = (): ReadonlySet<string> => new Set(REGELN.flatMap(([, , b]) => b));

const passt = (muster: string, pfad: string) => (muster.endsWith('*') ? pfad.startsWith(muster.slice(0, -1)) : pfad === muster);

/** Bereiche einer Route der Werkbank; `null` = nicht zugeordnet (dann nur „Gesamte Verwaltung“). */
export function bereicheDerRoute(methode: string, pfad: string): string[] | null {
  for (const [m, p, b] of REGELN) if ((m === '*' || m === methode) && passt(p, pfad)) return b;
  return null;
}

function paketdatenHeikel(body: unknown): HeikleHandlung | null {
  const x = (body ?? {}) as { einrichtung?: unknown; nachweise?: unknown };
  const frisch = (art: PaketdatenArt, l: unknown) => Array.isArray(l) && l.some((b) => istPaketdatenBereich(b) && brauchtFrisch(art, b));
  return frisch('einrichtung', x.einrichtung) || frisch('nachweise', x.nachweise) ? 'rechte' : null;
}

const UMBAU_ROUTEN = new Set(['POST /api/werkbank/pakete/installieren', 'POST /api/werkbank/pakete/:id/aktualisieren']);
const umbauHandlung = (body: unknown): HeikleHandlung | null =>
  (body as { umbauBestaetigt?: unknown } | null)?.umbauBestaetigt === true ? 'rechte' : null;

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
  // Entfernte Sicherung zurückholen (#976): gleiche Handlung – danach lässt sie sich herunterladen.
  'POST /api/werkbank/sicherung/:name/holen': 'sicherung',
  'PUT /api/werkbank/anbindung': 'anbindung',
  'PUT /api/werkbank/anbieter': 'anbieter',
  'PUT /api/werkbank/betrieb/mail': 'mailversand',
  // Versand über OAuth (#813): anmelden bzw. abmelden ändert, womit Ablago verschickt.
  'POST /api/werkbank/betrieb/mail/oauth/start': 'mailversand',
  'POST /api/werkbank/betrieb/mail/oauth/geraet': 'mailversand',
  'POST /api/werkbank/betrieb/mail/oauth/abmelden': 'mailversand',
  // Aufruf von außen (#679): Adresse ohne Anmeldung anlegen oder erneuern, neues Geheimnis – Entfernen geht ohne.
  'POST /api/werkbank/automatisierungen/:id/aufruf': 'aufruf',
  // Nach außen (#671): Ziele freigeben (wohin Daten gehen dürfen) und Geheimnis für die Signatur – Entfernen geht ohne.
  'PUT /api/werkbank/automatisierungen/ziele': 'aussen',
  'POST /api/werkbank/automatisierungen/:id/geheimnis/:karte': 'aussen',
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
    case 'POST /api/werkbank/export':
      return (body as { passwoerter?: unknown } | null)?.passwoerter === true ? 'vollexport' : null;
    // Notfallzugang aus dem Internet erlauben (#815); zurück auf „nur Heimnetz“ geht ohne.
    case 'PUT /api/werkbank/anmeldeschutz/notfallzugang':
      return (body as { internet?: unknown } | null)?.internet === true ? 'notfall' : null;
    // Einrichtung und Nachweise für Pakete (#1054): „Zugang und Berechtigungen“ und Nachweise nur mit frischer Anmeldung.
    case 'PUT /api/werkbank/pakete/:id/paketdaten':
      return paketdatenHeikel(body);
    default:
      return null;
  }
}
