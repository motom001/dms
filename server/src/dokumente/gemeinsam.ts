/*
 * Was alle Klassen dieses Ordners brauchen (#1278, Schritt 5b; vorher in dokumente.dienst.ts): Dateiname bereinigen,
 * Anzeigbares erkennen, die Anbindung der Texterkennung. Bindet nichts aus dem Ordner ein – so rufen Umwandeln,
 * Versionen und geschützte PDFs sie, ohne dokumente.dienst.ts einzubinden.
 */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

export function dateiname(v: unknown): string {
  /* eslint-disable no-control-regex -- Steuerzeichen aus Dateinamen entfernen ist der Zweck */
  const s = text(v)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  /* eslint-enable no-control-regex */
  return (s || 'Dokument').slice(0, 200);
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Was der Dienst von der Texterkennung braucht (#45, #458). */
export interface TexterkennungAnbindung {
  anstossen(): void;
  erkenneSofort?(inhalt: Buffer, mime: string): Promise<{ text: string; info: string }>;
  /** Ausdrücklich neu erkennen (#458): Warteschlange, das Paket bekommt `neu`. */
  neuErkennen?(id: string): Promise<void>;
  /** Sofort, ohne Warteschlange (#458, „Volltext neu erzeugen“). */
  jetzt?(id: string, opt: { neu: boolean; signal?: AbortSignal }): Promise<void>;
}
