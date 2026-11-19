/**
 * Keine Deprecation-Warnungen von Fastify beim Start (QS-Runde 11/2026): Jeder Prozess schrieb „[FSTDEP023]
 * FastifyDeprecation: disableRequestLogging option is deprecated“ ins Protokoll. Fastify meldet jede Warnung nur einmal
 * je Prozess – darum eine eigene Testdatei, in der vorher kein anderer Server gestartet wurde.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { baueApp } from '../src/http/http';
import { Dienst } from '../src/dienst/dienst';
import { speicherRepo } from '../src/repo/speicher';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { Startmodus } from '../src/einrichtung/startmodus';

/** Warnungen mit Code FSTDEP…, die während `f` über `process.emitWarning` kommen. */
async function fastifyWarnungen(f: () => Promise<void>): Promise<string[]> {
  const funde: string[] = [];
  const merke = (w: Error & { code?: string }) => {
    if (w.code?.startsWith('FSTDEP') || w.name === 'FastifyDeprecation') funde.push(`${w.code ?? w.name}: ${w.message}`);
  };
  process.on('warning', merke);
  try {
    await f();
    // Node.js gibt Warnungen im nächsten Tick aus.
    await new Promise((r) => setImmediate(r));
  } finally {
    process.off('warning', merke);
  }
  return funde;
}

describe('Fastify ohne Deprecation-Warnungen (QS-Runde 11/2026)', () => {
  it('baueApp (Betrieb) und Startseite starten ohne FSTDEP-Warnung', async () => {
    const funde = await fastifyWarnungen(async () => {
      const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
      const app = await baueApp(dienst, konten);
      await app.ready();
      await app.inject({ method: 'GET', url: '/api/gesundheit' });
      await app.close();
      const s = new Startmodus({ port: 0, host: '127.0.0.1' });
      await s.oeffne();
      await s.schliesse();
    });
    assert.deepEqual(funde, []);
  });

  it('keine Fastify-Instanz im Server nutzt die veralteten Optionen disableRequestLogging oder requestIdLogLabel', () => {
    // Auch Einrichtungs- und Lasttestmodus: Die starten hier nicht ohne Weiteres, ihre Optionen stehen aber im Quelltext.
    const wurzel = fileURLToPath(new URL('../src', import.meta.url));
    const funde: string[] = [];
    const durchsuche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = join(ordner, e.name);
        if (e.isDirectory()) durchsuche(pfad);
        else if (e.name.endsWith('.ts') && /^\s*(disableRequestLogging|requestIdLogLabel)\s*:/m.test(readFileSync(pfad, 'utf8')))
          funde.push(pfad.slice(wurzel.length + 1));
      }
    };
    durchsuche(wurzel);
    assert.deepEqual(funde, []);
  });
});
