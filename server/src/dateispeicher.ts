import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Ablage der eigentlichen Dateien, adressiert über ihren SHA-256.
 * Dateien werden nie verändert, nur angelegt und (wenn kein Dokument
 * mehr darauf zeigt) gelöscht.
 */
export interface Dateispeicher {
  schreibe(sha256: string, inhalt: Buffer): Promise<void>;
  lies(sha256: string): Promise<Readable | Buffer>;
  loesche(sha256: string): Promise<void>;
}

const pruefeSha = (sha: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Ungültiger Prüfwert');
  return sha;
};

/** Dateisystem: <wurzel>/<haushalt>/<ab>/<sha256> */
export function ordnerSpeicher(wurzel: string, haushaltId: string): Dateispeicher {
  const pfad = (sha: string) => join(wurzel, haushaltId, pruefeSha(sha).slice(0, 2), sha);
  return {
    async schreibe(sha, inhalt) {
      const ziel = pfad(sha);
      if (await stat(ziel).then(() => true, () => false)) return; // gleicher Inhalt liegt schon da
      await mkdir(join(ziel, '..'), { recursive: true });
      const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, inhalt, { flag: 'wx' });
      await rename(tmp, ziel); // erst vollständig geschrieben, dann sichtbar
    },
    async lies(sha) { return createReadStream(pfad(sha)); },
    async loesche(sha) { await rm(pfad(sha), { force: true }); },
  };
}

export function speicherDateien(): Dateispeicher & { anzahl(): number } {
  const m = new Map<string, Buffer>();
  return {
    async schreibe(sha, inhalt) { m.set(pruefeSha(sha), Buffer.from(inhalt)); },
    async lies(sha) { const b = m.get(sha); if (!b) throw new Error('Datei fehlt'); return b; },
    async loesche(sha) { m.delete(sha); },
    anzahl: () => m.size,
  };
}

/** Vor jedem Schreiben prüfen, z. B. ob noch genug Speicherplatz frei ist (#116). */
export function mitPruefung(s: Dateispeicher, vorher: () => Promise<void>): Dateispeicher {
  return {
    async schreibe(sha, inhalt) { await vorher(); await s.schreibe(sha, inhalt); },
    lies: (sha) => s.lies(sha),
    loesche: (sha) => s.loesche(sha),
  };
}
