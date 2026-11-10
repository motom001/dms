/**
 * Kennungen von Paketen und Mappentypen (#1084) – die eine Stelle für Muster und Längen. Server, Oberfläche und die
 * Paketprüfung nehmen sie von hier; dms-registry prüft dieselben Grenzen (pruefen.py, Schema).
 *
 * - **Paket-Id:** Kleinbuchstaben, Ziffern, `_`, beginnt mit einem Buchstaben, bis {@link PAKET_ID_MAX} Zeichen. Dazu
 *   höchstens ein Punkt mit Zusatz (bis {@link PAKET_ZUSATZ_MAX}): `<hauptpaket>.<zusatz>`, z. B. `texterkennung.fra`
 *   – „ergänzt das Hauptpaket“; ein solches Paket muss `ergaenzt: <hauptpaket>` angeben.
 * - **Schlüssel:** Kennung, die ein Paket oder der Administrator vorgibt – Mappentyp, Feld, Register, Ansicht,
 *   Automatisierung, Beispiel –, bis {@link SCHLUESSEL_MAX} Zeichen.
 * - **Kennung eines Mappentyps im DMS:** eigene Typen haben ihren Schlüssel ohne Präfix (`rechnung`), Typen aus Paketen
 *   `paket:schluessel` (`basis:person`). Gespeichert sind Paket und Schlüssel getrennt (Spalten `paket`, `schluessel`
 *   der Tabelle mappentypen); nach außen gilt überall die Schreibweise mit Doppelpunkt – wie in Verweisen.
 *
 * Die Grenzen sind keine technischen: Kennungen sind Text ohne Längenbegrenzung in der Datenbank, Typen hängen per
 * uuid zusammen. Sie halten Links, Dateinamen und Anzeigen lesbar.
 */

export const PAKET_ID_MAX = 40;
export const PAKET_ZUSATZ_MAX = 20;
export const SCHLUESSEL_MAX = 60;

/** Teilmuster (ohne Anker) zum Zusammensetzen. */
export const PAKET_ID_TEIL = `[a-z][a-z0-9_]{1,${PAKET_ID_MAX - 1}}(?:\\.[a-z][a-z0-9_]{0,${PAKET_ZUSATZ_MAX - 1}})?`;
export const SCHLUESSEL_TEIL = `[a-z][a-z0-9_]{0,${SCHLUESSEL_MAX - 1}}`;

/** Paket-Id, z. B. `basis`, `haus_und_garten`, `texterkennung.fra`. */
export const PAKET_ID = new RegExp(`^${PAKET_ID_TEIL}$`);
/** Schlüssel (Mappentyp, Feld, Register, Ansicht, Automatisierung, Beispiel …), z. B. `rechnungsposition`. */
export const SCHLUESSEL = new RegExp(`^${SCHLUESSEL_TEIL}$`);
/** Verweis auf einen Mappentyp in Paketinhalten: eigener Schlüssel, `paket:schluessel` oder `dms:kennung`. */
export const TYPVERWEIS = new RegExp(`^(?:${PAKET_ID_TEIL}:)?${SCHLUESSEL_TEIL}$`);
/** Wie {@link TYPVERWEIS}, dazu „*“ (alle Mappentypen). */
export const TYPVERWEIS_ODER_ALLE = new RegExp(`^(?:\\*|(?:${PAKET_ID_TEIL}:)?${SCHLUESSEL_TEIL})$`);
/** Kennung eines Mappentyps im DMS: eigener Schlüssel oder `paket:schluessel` (gleiche Form wie ein Verweis). */
export const TYP_KENNUNG = TYPVERWEIS;

/** Hauptpaket einer Paket-Id mit Punkt (`texterkennung.fra` → `texterkennung`); null ohne Punkt. */
export function hauptpaket(id: string): string | null {
  const i = id.indexOf('.');
  return i > 0 ? id.slice(0, i) : null;
}

/** Kennung eines Mappentyps nach außen: `paket:schluessel` bzw. der Schlüssel allein (eigene Typen). */
export const typKennung = (paket: string | null | undefined, schluessel: string): string => (paket ? `${paket}:${schluessel}` : schluessel);

/** Zerlegt eine Kennung `paket:schluessel` (eindeutig: weder Paket-Id noch Schlüssel enthalten einen Doppelpunkt). */
export function teileKennung(kennung: string): { paket: string | null; schluessel: string } {
  const i = kennung.indexOf(':');
  return i < 0 ? { paket: null, schluessel: kennung } : { paket: kennung.slice(0, i), schluessel: kennung.slice(i + 1) };
}

/**
 * Herausgeber eines Pakets (#1084): umgedrehte Domain, z. B. `app.ablago` (offizielle Pakete) oder `org.example`.
 * Nur ASCII: mindestens zwei Teile, je Kleinbuchstaben, Ziffern und Bindestriche (nicht am Rand), höchstens 64 Zeichen,
 * kein Punycode (`xn--`) – damit nichts wie `app.ablago` aussieht, ohne es zu sein. Angezeigt wird er immer ganz.
 */
export const HERAUSGEBER_MAX = 64;
export const HERAUSGEBER = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,9}$/;
/** Herausgeber der offiziellen Pakete (Katalog des Projekts). */
export const OFFIZIELLER_HERAUSGEBER = 'app.ablago';
export const istHerausgeber = (v: unknown): v is string => typeof v === 'string' && v.length <= HERAUSGEBER_MAX && HERAUSGEBER.test(v) && !v.split('.').some((t) => t.startsWith('xn--'));
/** `app.ablago` und alles darunter (`app.ablago.*`) gehört dem Projekt (#1084, Sicherheit C). */
export const istOffiziellerHerausgeber = (h: string | null | undefined): boolean => !!h && (h === OFFIZIELLER_HERAUSGEBER || h.startsWith(`${OFFIZIELLER_HERAUSGEBER}.`));

/**
 * Kennung eines Mappentyps in Datei- und Ordnernamen (#1084, Sicherheit A): nie mit Doppelpunkt (Windows/SMB lehnen ihn
 * ab, manche Systeme trennen damit Pfade). Die eine feste, umkehrbare Schreibweise: `paket.schluessel` – eindeutig,
 * weil Schlüssel keinen Punkt enthalten und die Paket-Id höchstens einen; zurück mit {@link kennungAusDateiname}.
 */
export const kennungAlsDateiname = (kennung: string): string => kennung.replace(':', '.');
/** Umkehrung von {@link kennungAlsDateiname}: der letzte Punkt trennt Paket und Schlüssel. */
export function kennungAusDateiname(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? name : `${name.slice(0, i)}:${name.slice(i + 1)}`;
}
