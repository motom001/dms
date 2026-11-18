#!/usr/bin/env node
/**
 * Dokumentwerkzeuge getrennt und begrenzt (#1354): Prüfung im laufenden Container, als Benutzer von Ablago.
 *
 *   docker exec <container> ablago-als node /w/werkzeuge-pruefen.mjs
 *
 * Spricht den Werkzeugdienst über seinen Socket an – so wie Ablago (server/src/prozesse/werkzeugverbindung.ts):
 * 1. Benutzer und Grenzen, wie ein Werkzeug sie sieht: eigener Benutzer (nicht der von Ablago, nicht root),
 *    Speichergrenze gesetzt.
 * 2. Ein absichtlich riesiges PDF (eine Seite von 4 × 4 m, gerastert mit 150 dpi braucht rund 1,7 GB): Nur dieser
 *    Aufruf scheitert, rasch und mit Meldung; der Dienst arbeitet danach weiter.
 * 3. Andere Programme als Dokumentwerkzeuge lehnt der Dienst ab.
 * Nur node, keine Abhängigkeiten. Ausgabe: eine Zeile JSON; bei einem Fehler ::error:: und Code 1.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const WURZEL = process.env.DMS_WERKZEUG_WURZEL || '/run/ablago-werkzeuge';
const SOCKET = join(WURZEL, 'dienst', 'werkzeuge.sock');

/** Ein Aufruf: Zeile JSON hin, Rahmen (Art, Länge, Inhalt) zurück. */
function aufruf(befehl, args, zeitMs = 60_000) {
  return new Promise((ok, nein) => {
    const s = connect(SOCKET);
    const aus = [];
    const err = [];
    let rest = Buffer.alloc(0);
    const t0 = Date.now();
    s.on('error', nein);
    s.on('connect', () => s.write(`${JSON.stringify({ befehl, args, zeitMs })}\n`));
    s.on('data', (d) => {
      rest = Buffer.concat([rest, d]);
      while (rest.length >= 5 && rest.length >= 5 + rest.readUInt32BE(1)) {
        const art = rest[0];
        const inhalt = rest.subarray(5, 5 + rest.readUInt32BE(1));
        rest = rest.subarray(5 + inhalt.length);
        if (art === 1) aus.push(inhalt);
        else if (art === 2) err.push(inhalt);
        else if (art === 3 || art === 4) {
          ok({
            art: art === 3 ? 'ende' : 'fehler',
            ...JSON.parse(inhalt),
            aus: Buffer.concat(aus).toString(),
            err: Buffer.concat(err).toString(),
            ms: Date.now() - t0,
          });
          s.destroy();
        }
      }
    });
  });
}

const fehler = [];
const pruefe = (bedingung, text) => bedingung || fehler.push(text);

const stand = await aufruf('__stand', []);
const [uid, gid, kb] = stand.aus.trim().split(/\s+/);
pruefe(stand.art === 'ende' && stand.code === 0, `Stand: ${JSON.stringify(stand)}`);
pruefe(
  uid !== '0' && uid !== String(process.getuid()),
  `Werkzeuge laufen als Benutzer ${uid} (Ablago: ${process.getuid()}) – nicht getrennt`,
);
pruefe(/^\d+$/.test(kb ?? ''), `keine Speichergrenze für die Werkzeuge (ulimit -v: ${kb})`);

const dir = mkdtempSync(join(WURZEL, 'arbeit', 'probe-'));
chmodSync(dir, 0o2770);
let riesig;
let danach;
let fremd;
try {
  // Eine Seite von 11 760 × 11 760 pt: bei 150 dpi 24 500 × 24 500 Bildpunkte, rund 1,7 GB – unter poppler eigener
  // Obergrenze (2 GB), also nur von der Speichergrenze aufzuhalten.
  writeFileSync(
    join(dir, 'riesig.pdf'),
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 11760 11760]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
  riesig = await aufruf('pdftoppm', ['-r', '150', '-jpeg', join(dir, 'riesig.pdf'), join(dir, 's')]);
  pruefe(
    /out of memory|bogus memory|std::bad_alloc/i.test(riesig.err) || riesig.code !== 0,
    `riesiges PDF ging durch: ${JSON.stringify(riesig)}`,
  );
  pruefe(riesig.ms < 20_000, `riesiges PDF brauchte ${riesig.ms} ms`);
  danach = await aufruf('pdfinfo', [join(dir, 'riesig.pdf')]);
  pruefe(danach.code === 0 && /Pages:\s+1/.test(danach.aus), `nach dem riesigen PDF: ${JSON.stringify(danach)}`);
  fremd = await aufruf('sh', ['-c', 'id']);
  pruefe(fremd.art === 'fehler' && fremd.code === 'EACCES', `anderes Programm nicht abgelehnt: ${JSON.stringify(fremd)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const kurz = (r) => r && { art: r.art, code: r.code, signal: r.signal, ms: r.ms, err: r.err.trim().split('\n').slice(-1)[0] };
console.log(
  JSON.stringify({
    werkzeuge: { benutzer: Number(uid), gruppe: Number(gid), speicherMb: Math.round(Number(kb) / 1024) },
    riesig: kurz(riesig),
    danach: kurz(danach),
  }),
);
if (fehler.length) {
  for (const f of fehler) console.log(`::error::Dokumentwerkzeuge (#1354): ${f}`);
  process.exit(1);
}
