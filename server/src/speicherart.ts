import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Speicherart für den Lasttest (#612): Liegt der Datenordner auf einer Festplatte (HDD), einer SSD oder einer NVMe-SSD?
 * Aus dem Container geht das nur über /sys: Gerätenummer des Ordners → Blockgerät → (Partition → Platte, RAID/LVM →
 * die Platten darunter) → `queue/rotational` bzw. der Name `nvme…`. Liegt der Ordner auf einem Dateisystem ohne
 * eigenes Blockgerät (overlay des Containers, btrfs auf manchen NAS), zählen alle Platten des Rechners – nur wenn sie
 * alle gleich sind, gibt es ein Ergebnis. Sonst null: Dann wählt man auf der Seite selbst („weiß nicht“ geht auch).
 */
export type Speicherart = 'HDD' | 'SSD' | 'NVMe';

/** Haupt- und Nebennummer aus `stat().dev` (Linux: new_encode_dev). */
export function geraeteNummer(dev: number): { major: number; minor: number } {
  const major = Math.floor(dev / 256) & 0xfff;
  const minor = (dev & 0xff) | (Math.floor(dev / 4096) & 0xfff00);
  return { major, minor };
}

/** Platten unter einem Blockgerät: Partition → Platte, RAID/LVM (`slaves`) → die Platten darunter. */
function platten(sys: string, geraet: string, tiefe = 0): string[] {
  if (tiefe > 5) return [];
  const slaves = join(geraet, 'slaves');
  const unter = existsSync(slaves) ? readdirSync(slaves) : [];
  if (unter.length) return unter.flatMap((n) => platten(sys, realpathSync(join(sys, 'class/block', n)), tiefe + 1));
  return [existsSync(join(geraet, 'partition')) ? dirname(geraet) : geraet];
}

function art(platte: string): Speicherart | null {
  if (basename(platte).startsWith('nvme')) return 'NVMe';
  try {
    const r = readFileSync(join(platte, 'queue/rotational'), 'utf8').trim();
    return r === '1' ? 'HDD' : r === '0' ? 'SSD' : null;
  } catch {
    return null;
  }
}

/** Alle echten Platten des Rechners (mit `device`, ohne loop, ram, zram, CD). */
function allePlatten(sys: string): string[] {
  const block = join(sys, 'block');
  if (!existsSync(block)) return [];
  return readdirSync(block)
    .filter((n) => !/^(loop|ram|zram|sr|fd|nbd)/.test(n) && existsSync(join(block, n, 'device')))
    .map((n) => realpathSync(join(block, n)));
}

const einheitlich = (arten: Array<Speicherart | null>): Speicherart | null =>
  arten.length && arten.every((a) => a && a === arten[0]) ? arten[0] : null;

export function erkenneSpeicherart(ordner: string, o: { sys?: string; dev?: number } = {}): Speicherart | null {
  const sys = o.sys ?? '/sys';
  try {
    const { major, minor } = geraeteNummer(o.dev ?? statSync(ordner).dev);
    const geraet = join(sys, 'dev/block', `${major}:${minor}`);
    if (major !== 0 && existsSync(geraet)) {
      const a = einheitlich(platten(sys, realpathSync(geraet)).map(art));
      if (a) return a;
    }
    return einheitlich(allePlatten(sys).map(art));
  } catch {
    return null;
  }
}
