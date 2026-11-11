/**
 * `mappenaktionen` im Manifest lesen (#1039) – Schreibweise in `shared/src/paketaktionen.ts`, Beispiele im
 * Entwicklerhandbuch („Aktionen im Menü „Mappe““). Die Paketprüfung (`liesPaket`) sammelt die Fehler.
 */
import { bereinigeAnzeige } from '../../../shared/src/anzeige';
import { SCHLUESSEL, TYPVERWEIS } from '../../../shared/src/kennungen';
import {
  AKTION_BESCHREIBUNG_MAX, AKTION_NAME_MAX, AKTION_RECHTE, istAktionRecht, KERN_DIALOGE, MAPPENAKTIONEN_MAX, type AktionBedingung, type KernDialog, type MappenAktion,
} from '../../../shared/src/paketaktionen';

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Liest `mappenaktionen` aus dem Manifest. `hatCode`: Das Paket bringt Code mit – sonst gehen nur Aktionen mit einem
 * Kern-Dialog. Fehler als Texte (die Paketprüfung sammelt sie).
 */
export function liesMappenaktionen(roh: unknown, o: { hatCode: boolean }): { aktionen: MappenAktion[]; fehler: string[] } {
  const fehler: string[] = [];
  if (roh === undefined || roh === null) return { aktionen: [], fehler };
  if (!Array.isArray(roh)) return { aktionen: [], fehler: ['mappenaktionen: erwartet eine Liste.'] };
  if (roh.length > MAPPENAKTIONEN_MAX) fehler.push(`mappenaktionen: höchstens ${MAPPENAKTIONEN_MAX} Aktionen.`);
  const aktionen: MappenAktion[] = [];
  const gesehen = new Set<string>();
  for (const [i, a] of roh.slice(0, MAPPENAKTIONEN_MAX).entries()) {
    const wo = `mappenaktionen[${i + 1}]`;
    if (!istObjekt(a)) { fehler.push(`${wo}: erwartet ein Objekt.`); continue; }
    const f = (x: string) => fehler.push(`${wo}: ${x}`);
    const schluessel = str(a.schluessel);
    if (!SCHLUESSEL.test(schluessel)) f(`ungültiger Schlüssel „${schluessel}“.`);
    else if (gesehen.has(schluessel)) f(`Schlüssel „${schluessel}“ doppelt.`);
    gesehen.add(schluessel);
    const name = str(a.name).trim();
    if (!name) f('Name fehlt.');
    else if (name.length > AKTION_NAME_MAX) f(`Name höchstens ${AKTION_NAME_MAX} Zeichen.`);
    const beschreibung = str(a.beschreibung).trim();
    if (beschreibung.length > AKTION_BESCHREIBUNG_MAX) f(`beschreibung höchstens ${AKTION_BESCHREIBUNG_MAX} Zeichen.`);
    const { typen, rechte, anlegen } = liesListen(a, f);
    const dialog = liesDialogArt(a, rechte, o.hatCode, f);
    const bedingung = a.bedingung === undefined ? undefined : liesBedingung(a.bedingung, f);
    aktionen.push({
      schluessel, name, ...(beschreibung ? { beschreibung } : {}), mappentypen: [...new Set(typen)], rechte: [...new Set(rechte.filter(istAktionRecht))],
      ...(anlegen.length ? { anlegen: [...new Set(anlegen)] } : {}), ...(bedingung ? { bedingung } : {}), ...(dialog ? { dialog } : {}),
    });
  }
  return { aktionen, fehler };
}

const keinPaketTyp = (v: string) => !TYPVERWEIS.test(v) || v.startsWith('dms:');

/** mappentypen, rechte und anlegen einer Aktion. */
function liesListen(a: Record<string, unknown>, f: (x: string) => void): { typen: string[]; rechte: string[]; anlegen: string[] } {
  const liste = (x: unknown) => (Array.isArray(x) ? x : []).map(str);
  const typen = liste(a.mappentypen);
  if (!typen.length) f('mappentypen nennt mindestens einen Mappentyp.');
  for (const v of typen.filter(keinPaketTyp)) f(`mappentypen „${v}“ ist kein Mappentyp eines Pakets (eigener Schlüssel oder paket:typ).`);
  const rechte = liste(a.rechte);
  if (!rechte.length) f(`rechte nennt, was die Aktion am Ende braucht (${AKTION_RECHTE.join(', ')}).`);
  for (const r of rechte.filter((x) => !istAktionRecht(x))) f(`unbekanntes Recht „${r}“ (möglich: ${AKTION_RECHTE.join(', ')}).`);
  const anlegen = liste(a.anlegen);
  if (rechte.includes('mappen_anlegen') && !anlegen.length) f('mappen_anlegen braucht anlegen (Mappentypen, die die Aktion anlegt).');
  if (anlegen.length && !rechte.includes('mappen_anlegen')) f('anlegen gibt es nur mit dem Recht mappen_anlegen.');
  for (const v of anlegen.filter(keinPaketTyp)) f(`anlegen „${v}“ ist kein Mappentyp eines Pakets.`);
  return { typen, rechte, anlegen };
}

/** Kern-Dialog statt Code: nur aus der festen Liste; „Brief aus Vorlage“ legt nur ein Dokument ab (und lädt es herunter). */
function liesDialogArt(a: Record<string, unknown>, rechte: string[], hatCode: boolean, f: (x: string) => void): KernDialog | undefined {
  if (a.dialog === undefined) {
    if (!hatCode) f(`Ohne Code (code:) geht nur eine Aktion mit dialog (${KERN_DIALOGE.join(', ')}).`);
    return undefined;
  }
  if (!(KERN_DIALOGE as readonly string[]).includes(str(a.dialog))) { f(`dialog „${str(a.dialog)}“ gibt es nicht (möglich: ${KERN_DIALOGE.join(', ')}).`); return undefined; }
  if (!rechte.includes('dokument_hinzufuegen') || rechte.some((r) => r !== 'dokument_hinzufuegen' && r !== 'herausgeben')) f('dialog dms:vorlage braucht das Recht dokument_hinzufuegen (dazu höchstens herausgeben).');
  return str(a.dialog) as KernDialog;
}

/** Bedingung wie „Anzeigen, wenn …“ (#1033) mit Grund; nur Feldwerte und Merkmale. */
function liesBedingung(roh: unknown, f: (x: string) => void): AktionBedingung | undefined {
  const b = istObjekt(roh) ? roh : null;
  const regel = b ? bereinigeAnzeige(b) : undefined;
  const grund = b ? str(b.grund).trim() : '';
  if (!regel) f('bedingung braucht modus und mindestens eine gültige Bedingung (wie anzeigen an Feldern).');
  else if (regel.bedingungen.some((x) => x.art === 'verweistyp' || (x.art === 'feld' && x.bedingung.op === 'zeigtAuf'))) f('bedingung: nur Feldwerte und Merkmale, keine Verweise auf bestimmte Mappen oder Typen.');
  if (!grund) f('bedingung braucht einen grund (steht im Menü, solange die Aktion nicht geht).');
  else if (grund.length > AKTION_BESCHREIBUNG_MAX) f(`grund höchstens ${AKTION_BESCHREIBUNG_MAX} Zeichen.`);
  return regel && grund ? { regel, grund } : undefined;
}

