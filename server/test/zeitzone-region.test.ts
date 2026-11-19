/**
 * Uhrzeiten in der Zone der Region (#1451): Anmeldesperre, Postfach, Pakete-Hilfen, Externmessung, `dms` und Aufgaben
 * ohne Empfänger formatieren mit den gemerkten Formaten aus shared/src/region.ts – also in der eingestellten Zone, nicht
 * in der des Server-Prozesses. Der Prozess läuft hier absichtlich in UTC, die Region in Europe/Berlin: 22:45 UTC am
 * 2. Januar ist dort schon der 3. Januar.
 */
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { setzeZeitzone, STANDARD_ZEITZONE } from '../../shared/src/region';
import { Anmeldesperre } from '../src/anmeldung/anmeldesperre';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { fuehreAus, zerlege, type Verbindung } from '../src/dms';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { zeitText } from '../src/pakete/verwaltung/hilfen';
import { Postfaecher, type GeleseneMail, type ImapSitzung } from '../src/post/postfach';
import { speicherRepo } from '../src/repo/speicher';
import { Externmessung, speicherExternSpeicher } from '../src/system/externmessung';

/** 22:45 UTC am 2. Januar = 23:45 in Berlin; eine Stunde später ist es dort schon der 3. Januar. */
const SPAET = Date.parse('2026-01-02T22:45:00Z');
const MIN = 60_000;

describe('Uhrzeiten in der Zone der Region bei abweichender Prozesszone (#1451)', () => {
  afterEach(() => setzeZeitzone(STANDARD_ZEITZONE));

  it('Gegenprobe: der Prozess läuft in UTC', () => {
    assert.equal(new Date(SPAET).getHours(), 22);
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC');
  });

  it('Anmeldesperre: „Gesperrt bis“ in der Zone der Region', async () => {
    setzeZeitzone('Europe/Berlin');
    const s = new Anmeldesperre(speicherEinstellungen(), undefined, () => SPAET);
    await s.speichere({ ip: { versuche: 2, minuten: 60 } }, 'test');
    for (let i = 0; i < 2; i++) await s.fehlschlag(`n${i}@example.org`, '203.0.113.5');
    await assert.rejects(
      s.pruefe('lena@example.org', '203.0.113.5'),
      (e) => e instanceof Fachfehler && e.status === 429 && /Gesperrt bis 03\.01\.26, 00:45\./.test(e.message),
    );
  });

  it('Pakete: Zeitpunkte in Meldungen (zeitText) in der Zone der Region', () => {
    setzeZeitzone('Europe/Berlin');
    assert.equal(zeitText(new Date(SPAET + 60 * MIN).toISOString()), '03.01.2026, 00:45');
    assert.equal(zeitText('kein Datum'), 'kein Datum');
  });

  it('Externmessung: „pausiert bis“ nennt den Tag in der Zone der Region', async () => {
    // Die Monatsgrenze selbst bleibt die Ortszeit des Servers (hier UTC: 1. Dezember, 0 Uhr). In New York ist das noch
    // der 30. November – so zeigt sich, dass die Meldung die Zone der Region nimmt.
    setzeZeitzone('America/New_York');
    const m = new Externmessung();
    const einst = speicherEinstellungen();
    m.setze({ speicher: speicherExternSpeicher(), einstellungen: einst });
    m.jetzt = () => new Date(2026, 10, 30, 12, 0);
    await einst.schreibe('extern_kosten', { preise: { ki_cloud: { ein: 10, aus: 0 } }, waehrung: 'EUR', budget: 0.5, hart: true });
    await m.frisch();
    const aufruf: Parameters<Externmessung['erfasse']>[0] = {
      dienst: 'ki',
      paket: 'ki_cloud',
      funktion: 'antworten',
      ersteMs: 1,
      ms: 1,
      hin: 1,
      zurueck: 1,
      ergebnis: 'ok',
      tokenEin: 50_000,
      tokenAus: 0,
    };
    m.erfasse(aufruf);
    await assert.rejects(
      m.pruefePause('ki_cloud'),
      (e) => e instanceof Fachfehler && e.status === 429 && /^KI-Funktionen pausiert bis 30\. November 2026/.test(e.message),
    );
  });

  it('dms: Uhrzeiten in der Zone der Region, die der Befehl vom Server holt', async () => {
    for (const [zone, erwartet] of [
      ['Europe/Berlin', '03.01.26, 00:45'],
      ['America/New_York', '02.01.26, 18:45'],
    ] as const) {
      const anfragen: string[] = [];
      const v: Verbindung = {
        async anfrage<T>(methode: string, pfad: string): Promise<T> {
          anfragen.push(`${methode} ${pfad}`);
          if (pfad === '/api/region') return { land: 'DE', bundesland: null, zeitzone: zone } as T;
          return { gesperrt: [{ ip: '203.0.113.7', grund: 'Liste', seit: new Date(SPAET + 60 * MIN).toISOString(), bis: null }] } as T;
        },
      };
      const zeilen: string[] = [];
      await fuehreAus(
        zerlege(['gesperrt']),
        v,
        { interaktiv: false, frage: async () => '' },
        { zeile: (z) => zeilen.push(z), json: () => {} },
      );
      assert.deepEqual(anfragen, ['GET /api/werkbank/anmeldeschutz', 'GET /api/region']);
      assert.match(zeilen.join('\n'), new RegExp(`203\\.0\\.113\\.7\\s+${erwartet.replace(/\./g, '\\.')}`), zone);
    }
    // Antwortet der Server ohne Region, bleibt die Vorgabe Europe/Berlin.
    setzeZeitzone(STANDARD_ZEITZONE);
    const ohne: Verbindung = {
      async anfrage<T>(_m: string, pfad: string): Promise<T> {
        if (pfad === '/api/region') throw new Error('weg');
        return { gesperrt: [{ ip: '203.0.113.7', grund: 'Liste', seit: new Date(SPAET + 60 * MIN).toISOString(), bis: null }] } as T;
      },
    };
    const zeilen: string[] = [];
    await fuehreAus(
      zerlege(['gesperrt']),
      ohne,
      { interaktiv: false, frage: async () => '' },
      { zeile: (z) => zeilen.push(z), json: () => {} },
    );
    assert.match(zeilen.join('\n'), /03\.01\.26, 00:45/);
  });

  it('Postfach: „Mail von … vom …“ in der Historie der Post in der Zone der Region', async () => {
    setzeZeitzone('Europe/Berlin');
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const mails = new Map<number, Buffer>([
      [
        1,
        Buffer.from(
          JSON.stringify({
            messageId: '<spaet@example.org>',
            betreff: 'Rechnung',
            absenderAdresse: 'shop@example.org',
            datum: '2026-01-02T23:30:00Z',
            text: 'Anbei.',
          }),
        ),
      ],
    ]);
    const sitzung: ImapSitzung = {
      uidValidity: '1',
      anzahl: mails.size,
      neue: async (ab) => [...mails.keys()].filter((u) => u >= ab).map((uid) => ({ uid, messageId: '<spaet@example.org>' })),
      quelle: async (uid) => mails.get(uid)!,
      verschiebe: async (uid) => void mails.delete(uid),
      gelesen: async () => {},
      loesche: async (uid) => void mails.delete(uid),
      ordnerListe: async () => ['INBOX'],
      schliessen: async () => {},
    };
    const lies = async (q: Buffer): Promise<GeleseneMail> => {
      const m = JSON.parse(q.toString()) as Omit<GeleseneMail, 'datum' | 'anhaenge'> & { datum: string };
      return { ...m, datum: new Date(m.datum), anhaenge: [] };
    };
    const pf = new Postfaecher({
      dienst: d,
      einstellungen: speicherEinstellungen(),
      verbinde: async () => sitzung,
      lies,
      verschluessele: (k) => `v1:${k}`,
      entschluessele: (w) => w.slice(3),
    });
    const [p] = await pf.speichere(
      { name: 'Rechnungen', server: 'imap.example.org', port: 993, benutzer: 'ablage@example.org', passwort: 'app-passwort' },
      null,
      'test',
    );
    assert.equal(await pf.abrufen(p.id), 1);
    const postTyp = await d.eingangskanaele.postTyp();
    const [post] = await d.mappen.listeMappen(postTyp.id);
    const h = (await d.mappenHistorie.historie(post.id)).find((x) => x.art === 'uebernommen');
    assert.match(String(h?.daten.text), /Mail von shop@example\.org vom 03\.01\.26, 00:30/, JSON.stringify(h));
  });
});
