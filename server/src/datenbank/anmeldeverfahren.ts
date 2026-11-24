/**
 * Wie meldet sich Ablago an PostgreSQL an (#1612)? MD5 ist ab PostgreSQL 18 abgekündigt – die Werkbank weist darauf
 * hin, solange die Verbindung MD5 nutzt.
 *
 * Gefragt wird PostgreSQL selbst, ohne Passwort und ohne besondere Rechte: Ablago öffnet eine Verbindung wie für die
 * Anmeldung (TCP oder Socket), schickt die Startnachricht mit Benutzer und Datenbank und liest, welches Verfahren der
 * Server verlangt – dann wird die Verbindung geschlossen. Das ist das Verfahren, das wirklich gilt: Steht in
 * `pg_hba.conf` „md5“, das Passwort ist aber schon mit SCRAM gespeichert, verlangt PostgreSQL SCRAM.
 */
import { connect, type Socket } from 'node:net';
import { join } from 'node:path';

/** `md5`, `scram` (SCRAM-SHA-256), `ohne` (trust/peer, z. B. über den Socket), `klartext`, `andere` (GSS, SSPI …). */
export type Anmeldeverfahren = 'md5' | 'scram' | 'ohne' | 'klartext' | 'andere';

/** Kennzahlen der Nachricht „Authentication“ (R) im Protokoll 3.0. */
const VERFAHREN: Record<number, Anmeldeverfahren> = { 0: 'ohne', 3: 'klartext', 5: 'md5', 10: 'scram' };

/** Startnachricht (Protokoll 3.0): Länge, Version 196608, dann Schlüssel/Wert-Paare, mit einer leeren Zeichenkette am Ende. */
export function startnachricht(benutzer: string, datenbank: string): Buffer {
  const teile = Buffer.from(`user\0${benutzer}\0database\0${datenbank}\0\0`, 'utf8');
  const kopf = Buffer.alloc(8);
  kopf.writeInt32BE(8 + teile.length, 0);
  kopf.writeInt32BE(196608, 4);
  return Buffer.concat([kopf, teile]);
}

/** Erste Antwort des Servers lesen: „R“ mit Kennzahl → Verfahren; Fehler („E“) oder anderes → null. */
export function verfahrenAus(antwort: Buffer): Anmeldeverfahren | null | undefined {
  if (antwort.length < 1) return undefined;
  if (antwort[0] !== 0x52) return null;
  if (antwort.length < 9) return undefined;
  return VERFAHREN[antwort.readInt32BE(5)] ?? 'andere';
}

/**
 * Das Verfahren für Host (oder Socket-Ordner, beginnt mit „/“), Port, Benutzer und Datenbank. null, wenn PostgreSQL
 * nicht antwortet oder die Verbindung ablehnt – dann gibt es keinen Hinweis.
 */
export function anmeldeverfahren(
  a: { host: string; port: number; benutzer: string; datenbank: string },
  zeitgrenzeMs = 3000,
): Promise<Anmeldeverfahren | null> {
  return new Promise((fertig) => {
    const s: Socket = a.host.startsWith('/') ? connect(join(a.host, `.s.PGSQL.${a.port}`)) : connect(a.port, a.host);
    let puffer = Buffer.alloc(0);
    const uhr = setTimeout(() => ende(null), zeitgrenzeMs);
    function ende(v: Anmeldeverfahren | null) {
      clearTimeout(uhr);
      s.destroy();
      fertig(v);
    }
    s.on('connect', () => s.write(startnachricht(a.benutzer, a.datenbank)));
    s.on('data', (d: Buffer) => {
      puffer = Buffer.concat([puffer, d]);
      const v = verfahrenAus(puffer);
      if (v !== undefined) ende(v);
    });
    s.on('error', () => ende(null));
    s.on('close', () => ende(null));
  });
}
