/**
 * Anmeldeverfahren der Datenbank (#1612): PostgreSQL sagt nach der Startnachricht, welches Verfahren es verlangt. Ein
 * kleiner Server im Test antwortet wie PostgreSQL mit MD5, SCRAM oder „ohne Passwort“; die Werkbank zeigt den Hinweis
 * nur bei MD5.
 */
import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { anmeldeverfahren, startnachricht, verfahrenAus } from '../src/datenbank/anmeldeverfahren';
import { AnbindungVerwaltung } from '../src/datenbank/anbindung';

/** Antwort „Authentication“ (R) mit Kennzahl, wie PostgreSQL sie nach der Startnachricht schickt. */
const antwortR = (kennzahl: number, rest = Buffer.alloc(0)) => {
  const b = Buffer.alloc(9);
  b.write('R', 0);
  b.writeInt32BE(8 + rest.length, 1);
  b.writeInt32BE(kennzahl, 5);
  return Buffer.concat([b, rest]);
};

const server: Server[] = [];
/** Ein Server, der nach der Startnachricht `antwort` schickt; merkt sich, was ankam. */
function postgresAttrappe(antwort: Buffer, pfad?: string): Promise<{ port: number; empfangen: Buffer[] }> {
  const empfangen: Buffer[] = [];
  const s = createServer((c) => {
    c.on('data', (d) => {
      empfangen.push(Buffer.from(d));
      // In zwei Stücken, wie es über das Netz kommen kann.
      c.write(antwort.subarray(0, 3));
      setTimeout(() => c.write(antwort.subarray(3)), 5);
    });
    c.on('error', () => {});
  });
  server.push(s);
  return new Promise((fertig) => {
    if (pfad) s.listen(pfad, () => fertig({ port: 0, empfangen }));
    else s.listen(0, '127.0.0.1', () => fertig({ port: (s.address() as AddressInfo).port, empfangen }));
  });
}
after(() => {
  for (const s of server) s.close();
});

const ZIEL = { host: '127.0.0.1', benutzer: 'dms', datenbank: 'dms' };

describe('Anmeldeverfahren der Datenbank (#1612)', () => {
  it('erkennt MD5, SCRAM und die Anmeldung ohne Passwort', async () => {
    const md5 = await postgresAttrappe(antwortR(5, Buffer.from([1, 2, 3, 4])));
    assert.equal(await anmeldeverfahren({ ...ZIEL, port: md5.port }), 'md5');
    const scram = await postgresAttrappe(antwortR(10, Buffer.from('SCRAM-SHA-256\0\0')));
    assert.equal(await anmeldeverfahren({ ...ZIEL, port: scram.port }), 'scram');
    const ohne = await postgresAttrappe(antwortR(0));
    assert.equal(await anmeldeverfahren({ ...ZIEL, port: ohne.port }), 'ohne');
    // Gesendet wird nur die Startnachricht mit Benutzer und Datenbank – nie ein Passwort.
    assert.deepEqual(Buffer.concat(md5.empfangen), startnachricht('dms', 'dms'));
  });

  it('über den Socket: Ordner und Port wie bei PostgreSQL (.s.PGSQL.<port>)', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'k48o-anmeldung-'));
    try {
      await postgresAttrappe(antwortR(0), join(ordner, '.s.PGSQL.5432'));
      assert.equal(await anmeldeverfahren({ ...ZIEL, host: ordner, port: 5432 }), 'ohne');
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  it('Fehler, abgelehnte Verbindung oder keine Antwort: null (kein Hinweis)', async () => {
    const fehler = await postgresAttrappe(Buffer.from('E\0\0\0\x08SFATAL\0'));
    assert.equal(await anmeldeverfahren({ ...ZIEL, port: fehler.port }), null);
    assert.equal(await anmeldeverfahren({ ...ZIEL, port: 1 }), null);
    assert.equal(verfahrenAus(Buffer.alloc(0)), undefined, 'noch nichts da');
    assert.equal(verfahrenAus(antwortR(7)), 'andere', 'GSS');
  });

  it('Stand der Anbindung nennt das Verfahren (einmal gefragt, dann gemerkt)', async () => {
    let gefragt = 0;
    const a = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'x' };
    const v = new AnbindungVerwaltung(
      '/gibt-es-nicht',
      a,
      null,
      () => {},
      undefined,
      false,
      async () => {
        gefragt++;
        return 'md5';
      },
    );
    assert.equal((await v.stand()).anmeldung, 'md5');
    assert.equal((await v.stand()).anmeldung, 'md5');
    assert.equal(gefragt, 1);
  });
});
