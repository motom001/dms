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

/**
 * Auflösung eines Scans in dpi (#1600), wie der Scanner sie in die Datei schreibt: JPEG aus dem JFIF-Kopf (APP0) oder
 * aus EXIF (XResolution), PNG aus dem Block pHYs. null, wenn die Datei keine nennt – dann gilt sie als Foto ohne Maß.
 */
export function bildDpi(b: Buffer): number | null {
  const art = bildArt(b);
  if (art === 'image/png') return pngDpi(b);
  if (art === 'image/jpeg') return jpegDpi(b);
  return null;
}

const gerundet = (dpi: number) => (Number.isFinite(dpi) && dpi >= 1 && dpi <= 100_000 ? Math.round(dpi) : null);

function pngDpi(b: Buffer): number | null {
  // Blöcke ab Byte 8: Länge (4), Art (4), Daten, Prüfsumme (4); pHYs steht vor den Bilddaten (IDAT).
  for (let i = 8; i + 8 <= b.length;) {
    const laenge = b.readUInt32BE(i);
    const art = b.toString('latin1', i + 4, i + 8);
    if (art === 'IDAT' || art === 'IEND') return null;
    // Einheit 1 = Meter; 0 = nur Seitenverhältnis.
    if (art === 'pHYs' && laenge >= 9 && i + 17 <= b.length) return b[i + 16] === 1 ? gerundet(b.readUInt32BE(i + 8) * 0.0254) : null;
    i += 12 + laenge;
  }
  return null;
}

function jpegDpi(b: Buffer): number | null {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const m = b[i + 1],
      l = b.readUInt16BE(i + 2);
    if (m === 0xda) break;
    // JFIF: Einheit 1 = dpi, 2 = Punkte je cm; 0 = nur Seitenverhältnis.
    if (m === 0xe0 && l >= 14 && b.toString('latin1', i + 4, i + 9) === 'JFIF\0') {
      const einheit = b[i + 11],
        x = b.readUInt16BE(i + 12);
      if (einheit === 1) return gerundet(x);
      if (einheit === 2) return gerundet(x * 2.54);
    }
    if (m === 0xe1 && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') {
      const dpi = exifDpi(b, i + 10);
      if (dpi) return dpi;
    }
    i += 2 + l;
  }
  return null;
}

/** XResolution (0x011A, Bruch) mit ResolutionUnit (0x0128: 2 = Zoll, 3 = cm) aus dem ersten IFD. */
function exifDpi(b: Buffer, t: number): number | null {
  const le = b.toString('latin1', t, t + 2) === 'II';
  const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  try {
    const ifd = t + u32(t + 4);
    let x: number | null = null,
      einheit = 2;
    for (let k = 0, n = u16(ifd); k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x011a) {
        const o = t + u32(e + 8);
        x = u32(o) / u32(o + 4);
      }
      if (u16(e) === 0x0128) einheit = u16(e + 8);
    }
    if (x === null || (einheit !== 2 && einheit !== 3)) return null;
    return gerundet(einheit === 3 ? x * 2.54 : x);
  } catch {
    return null;
  }
}
