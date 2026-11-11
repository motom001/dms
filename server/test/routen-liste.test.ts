/**
 * Routenliste des Servers (#960): Beim Aufteilen von routen.ts in Fachdateien darf keine Route verloren gehen oder
 * doppelt hinzukommen, und jede nennt ihre Zugriffsstufe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';

/** Interne Routen, öffentliche API /api/v1 und die beiden Beschreibungen (openapi.json). Neue Routen: Zahl anpassen (#1034: Hinweise setzen und entfernen, intern und /api/v1; #1030: Zeilen einer Tabelle, intern und /api/v1; #1037: Vorschläge beim Auswählen, intern; #995: eigene Organisation lesen, setzen, übernehmen, intern). */
const ANZAHL = 633;

/**
 * Alle Routen ohne Anmeldung (`zugang: 'offen'`) mit Grund (#1029). Eine neue offene Route oder ein Wechsel der Stufe
 * macht den Test rot: Dann gehört sie bewusst hierher, mit einem Satz Begründung im PR. Durchgesehen von Sicherheit
 * am 10.11.2026. „Code“ heißt: der Handler prüft selbst einen Code, Schlüssel oder state.
 */
const OFFEN: Record<string, string> = {
  'GET /api/gesundheit': 'Gesundheit für Docker und Lastverteiler; nur ok und ein gekürzter Hash des Stands',
  'GET /api/wartung': 'Hinweis auf Wartung für die Anmeldeseite',
  'GET /api/sprache': 'Sprache der Anmeldeseite',
  'GET /api/sprache/texte/:kennung': 'Texte der Oberfläche vor der Anmeldung',
  'GET /api/konto/status': 'Anmeldeseite: eingerichtet?, Anbieter, Marke; Version und Konto nur angemeldet',
  'POST /api/einrichtung/code': 'Einrichtungsassistent: Code prüfen, nur solange nicht eingerichtet',
  'POST /api/einrichtung/pruefen': 'Einrichtungsassistent, mit Code (danach nur Gesamte Verwaltung)',
  'POST /api/einrichtung/datei/lesen': 'Einrichtungsassistent, mit Code',
  'POST /api/einrichtung/datei/schreiben': 'Einrichtungsassistent, mit Code',
  'GET /api/einrichtung/pakete': 'Einrichtungsassistent, mit Code',
  'POST /api/einrichtung/pakete/katalog': 'Einrichtungsassistent, mit Code; nur der offizielle Katalog',
  'POST /api/einrichtung/pakete/plan': 'Einrichtungsassistent, mit Code',
  'POST /api/einrichtung/mail/finden': 'Einrichtungsassistent, mit Code; nur Suche, nichts gespeichert',
  'POST /api/konto/einrichten': 'Erstes Konto anlegen, nur solange nicht eingerichtet',
  'POST /api/konto/anmelden': 'Anmeldung mit Passwort',
  'POST /api/konto/anmelden/code': 'Anmeldung, zweiter Faktor',
  'GET /api/konto/anbieter/start': 'Anmeldung über einen Anbieter (OIDC)',
  'GET /api/konto/anbieter/rueckkehr': 'Anmeldung über einen Anbieter, Rückkehr mit state',
  'POST /api/konsole/passwort': 'Konsole: nur mit Konsolen-Schlüssel und von localhost',
  'GET /api/konsole/ich': 'Konsole: nur mit Konsolen-Schlüssel und von localhost',
  'POST /api/konto/abmelden': 'Abmelden, auch mit abgelaufener Sitzung',
  'POST /api/konto/passwort-vergessen': 'Passwort vergessen (gleiche Antwort für jede Adresse)',
  'GET /api/konto/link/:schluessel': 'Link aus der E-Mail prüfen, mit Schlüssel',
  'POST /api/konto/passwort-setzen': 'Passwort setzen über den Link, mit Schlüssel',
  'GET /api/designs/:id/logo': 'Logo für die Anmeldeseite; ohne Anmeldung nur das Standard-Design',
  'GET /api/notfall': 'Notfallzugang mit dem Notfallblatt (#815)',
  'POST /api/notfall/pruefen': 'Notfallzugang, mit Notfallcode; Fehleingaben sperren den Adressbereich',
  'POST /api/notfall/einloesen': 'Notfallzugang, mit Notfallcode',
  'GET /api/notfall/blatt': 'Neues Notfallblatt nach dem Einlösen, mit kurzlebigem Schlüssel',
  'GET /api/abruf/anrede': 'Abrufseite für Dritte (#474): nur „du“ oder „Sie“',
  'POST /api/abruf': 'Abrufseite für Dritte, mit Abrufcode',
  'GET /api/abruf/datei': 'Abrufseite für Dritte, mit Abrufcode',
  'GET /api/wiederherstellung/status': 'Wiederherstellungsbildschirm für alle Besucher; ohne Adresse dessen, der sie gestartet hat',
  'POST /api/wiederherstellung/abschluss-gesehen': 'Wiederherstellungsbildschirm schließen; nur wenn keine läuft',
  'GET /api/wiederherstellung/sicherungen': 'Frisches System: mit Einrichtungscode, sonst Admin mit „Sicherung“',
  'POST /api/wiederherstellung/abgleich': 'Frisches System: mit Einrichtungscode, sonst Admin mit „Sicherung“',
  'POST /api/wiederherstellung/start': 'Frisches System: mit Einrichtungscode, sonst Admin mit „Sicherung“ und frischer Anmeldung',
  'GET /api/oauth/postfach/rueckruf': 'Rückruf des Mail-Anbieters; state, Bindungs-Cookie und Person werden geprüft',
  'GET /api/openapi.json': 'Beschreibung der öffentlichen API',
  'GET /api/v1/openapi.json': 'Beschreibung der öffentlichen API',
};

describe('Routenliste (#960)', () => {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  const alle = routen(d, konten, {});

  it('Anzahl der Routen unverändert', () => {
    assert.equal(alle.length, ANZAHL);
  });

  it('jede Route mit Zugriffsstufe und Handler', () => {
    for (const r of alle) {
      assert.ok(['offen', 'angemeldet', 'admin'].includes(r.zugang), `${r.methode} ${r.pfad}: zugang = ${String(r.zugang)}`);
      assert.equal(typeof r.handler, 'function', `${r.methode} ${r.pfad}: ohne Handler`);
    }
  });

  it('keine Kombination aus Methode und Adresse doppelt', () => {
    const gesehen = new Set<string>();
    const doppelt = alle.map((r) => `${r.methode} ${r.pfad}`).filter((k) => (gesehen.has(k) ? true : (gesehen.add(k), false)));
    assert.deepEqual(doppelt, []);
  });

  it('Routen ohne Anmeldung genau wie in der festen Liste (#1029)', () => {
    const offen = alle.filter((r) => r.zugang === 'offen').map((r) => `${r.methode} ${r.pfad}`).sort();
    const neu = offen.filter((k) => !(k in OFFEN));
    const weg = Object.keys(OFFEN).filter((k) => !offen.includes(k));
    assert.deepEqual(neu, [], 'Neue Route ohne Anmeldung: bewusst in OFFEN eintragen, mit Grund, und im PR begründen');
    assert.deepEqual(weg, [], 'Route ist nicht mehr offen oder fehlt: aus OFFEN streichen');
    for (const [k, grund] of Object.entries(OFFEN)) assert.ok(grund.trim().length >= 10, `${k}: Grund fehlt`);
  });
});
