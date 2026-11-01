/**
 * Archivmodus im Protokoll (#373): Umschalten im ungespeicherten Entwurf (dabei ruft die Oberfläche
 * nur POST /api/werkbank/archiv/vorschau) erzeugt keinen Eintrag; erst das Speichern des Mappentyps,
 * genau einmal und mit vorher/nachher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { anfrageStufe, modulAus, routen, type Anfrage } from '../src/routen';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'x');
  const { benutzer } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
  const t = await d.legeTypAn({ name: 'Beleg', felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' }] });
  await d.legeMappeAn({ typId: t.id, werte: { name: 'A', datum: '2020-01-01' } });
  const alle = routen(d, konten, {});
  /** Wie der HTTP-Adapter (http.ts): Handler, danach die Anfragezeile mit ihrer Stufe. */
  const rufe = async (methode: string, pfad: string, x: Partial<Anfrage>, url = pfad) => {
    const r = alle.find((y) => y.methode === methode && y.pfad === pfad)!;
    let status = 500;
    try { status = (await r.handler({ body: {}, params: {}, query: {}, ip: '127.0.0.1', benutzer, ...x })).status ?? 200; } catch (e) { status = (e as { status?: number }).status ?? 500; }
    protokoll.schreibe(anfrageStufe({ methode, url, status, lesend: r.lesend }), modulAus(url), `${methode} ${url} ${status}`);
    return status;
  };
  return { d, t, rufe };
}
/** Einträge ab Stufe „info“ (so steht das Protokoll im Normalbetrieb). */
const seit = (nr: number) => protokoll.eintraege({ seit: nr, stufe: 'info' });

describe('Archivmodus im Protokoll (#373)', () => {
  it('Entwurf an/aus/an → keine Einträge; Speichern → genau ein Eintrag mit vorher/nachher', async () => {
    const { t, rufe } = await aufbau();
    const vorher = protokoll.letzteNr;
    // Entwurf: an (Vorschau), aus (keine Anfrage), an mit anderer Frist, dazu eine ungültige Frist (422).
    assert.equal(await rufe('POST', '/api/werkbank/archiv/vorschau', { body: { typId: t.id, archiv: { jahre: 8, stichtag: 'datum' } } }), 200);
    assert.equal(await rufe('POST', '/api/werkbank/archiv/vorschau', { body: { typId: t.id, archiv: { jahre: 10, stichtag: 'datum' } } }), 200);
    assert.equal(await rufe('POST', '/api/werkbank/archiv/vorschau', { body: { typId: t.id, archiv: { jahre: 0, stichtag: 'datum' } } }), 422);
    assert.deepEqual(seit(vorher), [], 'Vorschau steht nicht im Protokoll');

    // Speichern
    const nachEntwurf = protokoll.letzteNr;
    const url = `/api/typen/${t.id}`;
    assert.equal(await rufe('PUT', '/api/typen/:id', { params: { id: t.id }, body: { ...t, archiv: { jahre: 10, stichtag: 'datum' } } }, url), 200);
    const archiv = seit(nachEntwurf).filter((e) => /Archivmodus/.test(e.text));
    assert.equal(archiv.length, 1);
    assert.equal(archiv[0].text, 'Archivmodus eingeschaltet');
    assert.deepEqual(archiv[0].daten, { typ: 'Beleg', vorher: { an: false }, nachher: { an: true, jahre: 10, stichtag: 'datum' } });
    assert.ok(seit(nachEntwurf).some((e) => e.text === `PUT ${url} 200`), 'das Speichern selbst steht weiter im Protokoll');

    // Erneut speichern ohne Änderung: kein weiterer Archiv-Eintrag; Ausschalten: Warnung mit vorher/nachher.
    const n2 = protokoll.letzteNr;
    await rufe('PUT', '/api/typen/:id', { params: { id: t.id }, body: { ...t, archiv: { jahre: 10, stichtag: 'datum' } } }, url);
    assert.equal(seit(n2).filter((e) => /Archivmodus/.test(e.text)).length, 0);
    const n3 = protokoll.letzteNr;
    await rufe('PUT', '/api/typen/:id', { params: { id: t.id }, body: { ...t, archiv: null } }, url);
    const aus = seit(n3).filter((e) => /Archivmodus/.test(e.text));
    assert.equal(aus.length, 1);
    assert.equal(aus[0].stufe, 'warn');
    assert.deepEqual(aus[0].daten, { typ: 'Beleg', vorher: { an: true, jahre: 10, stichtag: 'datum' }, nachher: { an: false } });
  });

  it('Neuer Mappentyp mit Archivmodus: ein Eintrag beim Anlegen', async () => {
    const { rufe } = await aufbau();
    const n = protokoll.letzteNr;
    await rufe('POST', '/api/typen', { body: { name: 'Rechnung', archiv: { jahre: 6, stichtag: null }, felder: [{ key: 'name', label: 'Name', typ: 'text' }] } });
    const e = seit(n).filter((x) => /Archivmodus/.test(x.text));
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].daten, { typ: 'Rechnung', vorher: { an: false }, nachher: { an: true, jahre: 6, stichtag: 'Anlagedatum' } });
  });

  it('Stufe der Anfragezeile: lesende POSTs nur „debug“, ändernde „info“', () => {
    assert.equal(anfrageStufe({ methode: 'POST', url: '/api/werkbank/archiv/vorschau', status: 200, lesend: true }), 'debug');
    assert.equal(anfrageStufe({ methode: 'POST', url: '/api/werkbank/archiv/vorschau', status: 422, lesend: true }), 'debug');
    assert.equal(anfrageStufe({ methode: 'POST', url: '/api/werkbank/archiv/vorschau', status: 500, lesend: true }), 'error');
    assert.equal(anfrageStufe({ methode: 'PUT', url: '/api/typen/x', status: 200 }), 'info');
    assert.equal(anfrageStufe({ methode: 'GET', url: '/api/typen', status: 200 }), 'debug');
    assert.equal(anfrageStufe({ methode: 'GET', url: '/api/typen', status: 404 }), 'info');
    assert.equal(anfrageStufe({ methode: 'GET', url: '/api/werkbank/protokoll', status: 200 }), 'trace');
    assert.equal(anfrageStufe({ methode: 'GET', url: '/api/konto/status', status: 401 }), 'debug');
    assert.equal(anfrageStufe({ methode: 'GET', url: '/ablage', status: 200 }), 'debug');
    // Alle Vorschau-, Zähl- und Testlauf-POSTs sind als lesend markiert.
    const lesend = routen(new Dienst(speicherRepo(), speicherDateien()), new Konten(speicherKontoRepo(), null, 'x'), {}).filter((r) => r.lesend).map((r) => r.pfad);
    assert.ok(lesend.includes('/api/werkbank/archiv/vorschau'));
    assert.ok(lesend.includes('/api/sichten/vorschau'));
    assert.ok(!lesend.includes('/api/werkbank/wartung/vorschau'), 'holt Vorschaubilder nach – ändert also');
  });
});
