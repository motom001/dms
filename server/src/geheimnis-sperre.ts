/**
 * Passwörter und Geheimnisse gibt Ablago nie heraus (#1055).
 *
 * Eine Stelle für alle maschinellen Wege nach außen – Pakete, API v1, Einrichtung und Nachweise (#1053), Vergleich,
 * Auskunft, Diagnose: Wer Daten für solche Wege zusammenstellt, schickt sie durch `ohneGeheimnisse`. Übrig bleibt je
 * Geheimnis nur „eingerichtet: ja/nein“. Es gibt keine Einstellung, die das abschaltet.
 *
 * Ausgenommen sind nur die beiden Wege für Menschen (admin/export.md): `passwoerter.csv` im Vollexport mit
 * ausdrücklicher Bestätigung und das Passwortfeld in der Mappe mit dem Recht „Passwörter sehen“ – beide mit frischer
 * Anmeldung und Protokoll. Das Systemprotokoll schickt die Daten jedes Eintrags hier durch (protokoll.ts).
 * `server/test/geheimnis-sperre.test.ts` durchsucht alle Ausgaben nach bekannten Testgeheimnissen.
 */
/** Wie in tresor.ts; kein Import, damit Protokoll und Tresor diese Datei ohne Kreislauf nutzen können. */
const istVerschluesselt = (v: unknown): v is string => typeof v === 'string' && v.startsWith('dms1$');

/**
 * Namen von Eigenschaften, deren Wert immer ein Geheimnis ist (genau so geschrieben, Groß-/Kleinschreibung egal).
 * Bewusst nicht darunter: `hash` und `sha256` (Prüfwerte von Dokumenten), `schluessel` (Kennung eines Mappentyps) und
 * allgemeine Wörter wie `zugriff` – solche Werte liegen verschlüsselt (`dms1$`) vor und fallen über den Wert heraus.
 */
const GEHEIME_NAMEN = new Set([
  'passwort', 'password', 'passwd', 'passworthash', 'passwordhash', 'schluesselhash', 'hashschluessel',
  'geheimnis', 'secret', 'clientsecret', 'client_secret', 'secretaccesskey', 'secret_access_key',
  'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token', 'id_token', 'oauthtoken', 'zugriffstoken',
  'apikey', 'api_key', 'apischluessel', 'privatekey', 'private_key', 'privaterschluessel',
  'totp', 'totpgeheimnis', 'wiederherstellungscodes', 'notfallcode', 'codehash', 'sitzungsschluessel',
]);

/** Ist dieser Name einer Eigenschaft ein Geheimnis? */
export const istGeheimerName = (name: string): boolean => GEHEIME_NAMEN.has(name.toLowerCase());

/** Muster für Geheimnisse, die man ohne den Klartext erkennt: verschlüsselte Werte und Passwort-Hashes. */
export const GEHEIM_MUSTER: ReadonlyArray<{ name: string; muster: RegExp }> = [
  { name: 'verschlüsselter Wert (dms1$)', muster: /dms1\$[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}/ },
  { name: 'Passwort-Hash (scrypt$)', muster: /scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+/ },
];

/** „eingerichtet: ja/nein“ an der Stelle eines Geheimnisses. */
const eingerichtet = (w: unknown) => ({ eingerichtet: w !== null && w !== undefined && w !== '' && w !== false });

/**
 * Tiefe Kopie ohne Geheimnisse: Eigenschaften mit geheimem Namen, verschlüsselte Werte (`dms1$…`) und Passwort-Hashes werden zu
 * `{ eingerichtet: boolean }`. Alles andere bleibt, wie es ist. Für Einrichtung, Nachweise, Vergleich und Pakete.
 */
export function ohneGeheimnisse<T>(wert: T): T {
  const geh = (w: unknown, tiefe: number): unknown => {
    if (tiefe > 64) return null;
    if (istVerschluesselt(w) || (typeof w === 'string' && GEHEIM_MUSTER.some((m) => m.muster.test(w)))) return eingerichtet(w);
    if (Array.isArray(w)) return w.map((x) => geh(x, tiefe + 1));
    if (!w || typeof w !== 'object' || w instanceof Date || Buffer.isBuffer(w)) return w;
    return Object.fromEntries(Object.entries(w as Record<string, unknown>).map(([k, v]) => [k, istGeheimerName(k) ? eingerichtet(v) : geh(v, tiefe + 1)]));
  };
  return geh(wert, 0) as T;
}

/** Wie ein Geheimnis in einer Ausgabe auftauchen kann: roh, Base64 (mit/ohne Füllzeichen), Base64url, URL, Hex. */
function formen(s: string): string[] {
  const b = Buffer.from(s, 'utf8');
  const b64 = b.toString('base64');
  return [...new Set([s, b64, b64.replace(/=+$/, ''), b.toString('base64url'), encodeURIComponent(s), b.toString('hex')])];
}

/**
 * Sucht bekannte Geheimnisse (in allen Formen) und die Muster aus `GEHEIM_MUSTER` in einem Text. Liefert, was
 * gefunden wurde, ohne den Wert selbst (nur die Stelle in der Liste bzw. den Namen des Musters).
 */
export function findeGeheimnisse(text: string, bekannte: readonly string[]): string[] {
  const aus: string[] = [];
  bekannte.forEach((s, i) => {
    if (!s || s.length < 8) return;
    const f = formen(s).find((x) => text.includes(x));
    if (f !== undefined) aus.push(`Geheimnis ${i + 1}${f === s ? '' : ' (kodiert)'}`);
  });
  for (const m of GEHEIM_MUSTER) if (m.muster.test(text)) aus.push(m.name);
  return aus;
}
