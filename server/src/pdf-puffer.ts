/**
 * pdf-lib liest Bilder über `new DataView(daten.buffer)` und übersieht dabei den Versatz eines
 * Node-Buffers im gemeinsamen Speicher. Liegt ein Buffer nicht am Anfang seines ArrayBuffers
 * (z. B. kleine Buffer aus dem Node-Pool oder `subarray`), meldet embedJpg „SOI not found“,
 * obwohl die Datei in Ordnung ist. Darum bekommt pdf-lib immer einen eigenen, bündigen Speicher.
 */
export function eigenerPuffer(daten: Uint8Array): Uint8Array {
  if (daten.byteOffset === 0 && daten.byteLength === daten.buffer.byteLength) return daten;
  return new Uint8Array(daten);
}
