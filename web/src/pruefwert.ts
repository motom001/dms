/**
 * Prüfwert (SHA-256) einer Datei im Browser (#333) – wie ihn der Server für jede Datei speichert.
 * Im sicheren Kontext (HTTPS, localhost) mit crypto.subtle; im Heimnetz über http:// gibt es das
 * nicht, dann rechnet eine kleine eigene Umsetzung (ca. 1 s für 50 MB).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 ohne crypto.subtle (für http:// im Heimnetz). */
export function sha256(daten: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const laenge = daten.length;
  // Auffüllen: 0x80, Nullen, Länge in Bits (64 Bit, big-endian) – nur der letzte Block wird kopiert.
  const voll = Math.floor(laenge / 64) * 64;
  const restLaenge = laenge - voll;
  const rest = new Uint8Array(restLaenge + 9 > 64 ? 128 : 64);
  rest.set(daten.subarray(voll));
  rest[restLaenge] = 0x80;
  const bits = laenge * 8;
  const dv = new DataView(rest.buffer);
  dv.setUint32(rest.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(rest.length - 4, bits >>> 0);
  const block = (b: Uint8Array, o: number) => {
    for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], c = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  };
  for (let o = 0; o < voll; o += 64) block(daten, o);
  for (let o = 0; o < rest.length; o += 64) block(rest, o);
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** Prüfwert einer Datei, als Hex wie auf dem Server. */
export async function pruefwert(datei: Blob): Promise<string> {
  const puffer = await datei.arrayBuffer();
  const subtle = typeof crypto !== 'undefined' && globalThis.isSecureContext ? crypto.subtle : undefined;
  if (subtle) {
    const d = new Uint8Array(await subtle.digest('SHA-256', puffer));
    return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return sha256(new Uint8Array(puffer));
}
