/**
 * Kleine Helfer für Bilddateien ohne Bibliothek: Art am Inhalt, Maße eines JPEG, EXIF-Ausrichtung.
 * Sie lesen nur Bytes und gehören zur PDF-Stelle (#541), weil die PDF-Vorgänge sie brauchen.
 */

/** Art eines Fotos am Inhalt (nicht am Namen – das iPhone nennt alles „image.jpg“). */
export function bildArt(b: Buffer): 'image/jpeg' | 'image/png' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  return null;
}

/**
 * Maße und Farbkomponenten eines JPEG aus dem SOF-Kopf. pdftoppm rundet selten um einen Bildpunkt, und
 * mit -gray schreibt es je nach poppler-Version ein JPEG mit einer oder mit drei Komponenten – der
 * Farbraum im PDF muss zur Datei passen, nicht zum Wunsch.
 */
export function jpegMasse(b: Buffer): { breite: number; hoehe: number; komponenten: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const l = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7), komponenten: b[i + 9] };
    i += 2 + l;
  }
  return null;
}

/** EXIF-Ausrichtung eines JPEG (1 = normal, 3 = 180°, 6 = 90° rechts, 8 = 90° links); 1, wenn keine. */
export function exifAusrichtung(b: Buffer): number {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const m = b[i + 1],
      l = b.readUInt16BE(i + 2);
    if (m === 0xda) break;
    if (m === 0xe1 && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') {
      const t = i + 10;
      const le = b.toString('latin1', t, t + 2) === 'II';
      const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
      const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
      try {
        const ifd = t + u32(t + 4);
        const n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          if (u16(e) === 0x0112) return u16(e + 8);
        }
      } catch {
        return 1;
      }
      return 1;
    }
    i += 2 + l;
  }
  return 1;
}
