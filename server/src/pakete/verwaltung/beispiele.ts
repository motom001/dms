/**
 * Beispiele im Paket (#347, #878): Dateien, Namen, Verweise, Reihenfolge, Werte.
 */
import { MAX_DATEIGROESSE, type Feld } from '../../../../shared/src/model';
import { BEISPIEL_ENDUNGEN, inMB } from '../../../../shared/src/pakete';
import { SCHLUESSEL } from '../../../../shared/src/kennungen';
import { t } from '../../sprache';
import { istVorgabeWert } from '../../../../shared/src/vorgaben';
import { istObjekt, type Paket, type PaketBeispiel, type PaketBeispielDokument, str } from './format';

/** Pfad eines Beispiel-Dokuments unter inhalt/: beispiele/, höchstens vier Ordner, einfache Namen mit Endung. */
const BEISPIEL_DATEI = /^beispiele\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}\/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Art einer Beispiel-Datei am Inhalt (#878): nur PDF, PNG und JPEG – und nur, wenn die Endung dazu passt. */
export function beispielDateiart(name: string, inhalt: Buffer): string | null {
  const erwartet = BEISPIEL_ENDUNGEN[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
  const kopf = inhalt.subarray(0, 8).toString('latin1');
  const ist = kopf.startsWith('%PDF-')
    ? 'application/pdf'
    : inhalt[0] === 0x89 && kopf.slice(1, 4) === 'PNG'
      ? 'image/png'
      : inhalt[0] === 0xff && inhalt[1] === 0xd8 && inhalt[2] === 0xff
        ? 'image/jpeg'
        : null;
  return erwartet && ist === erwartet ? ist : null;
}

/** Anzahl und Größe der Beispiel-Dokumente eines Pakets (#878). */
export function beispielDokumenteVon(p: Pick<Paket, 'beispiele' | 'beispielDateien'>): { anzahl: number; bytes: number } {
  const liste = p.beispiele.flatMap((b) => b.dokumente ?? []);
  return { anzahl: liste.length, bytes: liste.reduce((n, d) => n + (p.beispielDateien?.get(d.datei)?.length ?? 0), 0) };
}

/** Name des Dokuments in Ablago: der Titel (mit der Endung der Datei) oder der Dateiname. */
export function beispielName(d: PaketBeispielDokument): string {
  const datei = d.datei.slice(d.datei.lastIndexOf('/') + 1);
  const endung = datei.slice(datei.lastIndexOf('.'));
  const titel = d.titel?.trim();
  if (!titel) return datei;
  return titel.toLowerCase().endsWith(endung.toLowerCase()) ? titel : `${titel}${endung}`;
}

/** Verweis auf eine andere Beispiel-Mappe im Wert eines Felds (#347). */
export const istBeispielVerweis = (w: unknown): w is { beispiel: string } =>
  istObjekt(w) && typeof w.beispiel === 'string' && Object.keys(w).length === 1;

/** Alle Beispiel-Verweise in den Werten eines Beispiels (auch in Listen). */
export const beispielVerweise = (werte: Record<string, unknown>): string[] =>
  Object.values(werte).flatMap((w) => (Array.isArray(w) ? w : [w]).filter(istBeispielVerweis).map((x) => x.beispiel));

/** Verweise mit eigener Paket-Id („haushalt:x“) wie lokale („x“) behandeln – für die Reihenfolge. */
export const eigeneVerweise = (werte: Record<string, unknown>, id: string): Record<string, unknown> => {
  const eins = (x: unknown) =>
    istBeispielVerweis(x) && x.beispiel.startsWith(`${id}:`) ? { beispiel: x.beispiel.slice(id.length + 1) } : x;
  return Object.fromEntries(Object.entries(werte).map(([k, w]) => [k, Array.isArray(w) ? w.map(eins) : eins(w)]));
};

/** Reihenfolge, in der Beispiele angelegt werden: erst die, auf die andere zeigen. null = Kreis. */
export function ordneBeispiele(beispiele: PaketBeispiel[]): PaketBeispiel[] | null {
  const nach = new Map(beispiele.filter((b) => b.schluessel).map((b) => [b.schluessel!, b]));
  const fertig = new Set<PaketBeispiel>();
  const unterwegs = new Set<PaketBeispiel>();
  const erg: PaketBeispiel[] = [];
  const besuche = (b: PaketBeispiel): boolean => {
    if (fertig.has(b)) return true;
    if (unterwegs.has(b)) return false;
    unterwegs.add(b);
    for (const z of beispielVerweise(b.werte)) {
      const ziel = z.includes(':') ? undefined : nach.get(z);
      if (ziel && !besuche(ziel)) return false;
    }
    unterwegs.delete(b);
    fertig.add(b);
    erg.push(b);
    return true;
  };
  for (const b of beispiele) if (!besuche(b)) return null;
  return erg;
}

/**
 * Beispiel-Dokumente eines Beispiels (#878) lesen und prüfen wie beim Hochladen: Datei liegt unter inhalt/beispiele/,
 * ist PDF, PNG oder JPEG (am Inhalt erkannt, passend zur Endung), nicht leer und nicht größer als beim Hochladen.
 * PDFs liest Ablago hier nicht – das tun Vorschau und Texterkennung im Arbeiter (ladePdf), wie bei jedem Dokument.
 */
export function liesBeispielDokumente(
  roh: unknown,
  nr: number,
  dateien: Map<string, Buffer>,
  inhalt: Map<string, Buffer>,
  fehler: string[],
): PaketBeispielDokument[] {
  if (!Array.isArray(roh)) {
    fehler.push(t('meldungen.pakete.beispiel-dokumente-liste', { wert: nr }));
    return [];
  }
  return roh.flatMap((d, j): PaketBeispielDokument[] => {
    const wo = { wert: nr, nr: j + 1 };
    if (!istObjekt(d)) {
      fehler.push(t('meldungen.pakete.beispiel-dokumente-liste', { wert: nr }));
      return [];
    }
    const datei = str(d.datei).replace(/^\.\//, '');
    if (!BEISPIEL_DATEI.test(datei) || datei.split('/').includes('..')) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-pfad', { ...wo, datei }));
      return [];
    }
    const daten = dateien.get(`inhalt/${datei}`);
    if (!daten) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-fehlt', { ...wo, datei }));
      return [];
    }
    if (!daten.length) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-leer', { ...wo, datei }));
      return [];
    }
    if (daten.length > MAX_DATEIGROESSE) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-gross', { ...wo, datei, max: inMB(MAX_DATEIGROESSE) }));
      return [];
    }
    if (!beispielDateiart(datei, daten)) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-art', { ...wo, datei }));
      return [];
    }
    const titel =
      d.titel === undefined
        ? undefined
        : str(d.titel)
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim();
    if (titel !== undefined && (!titel || titel.length > 200 || /[\\/]/.test(titel))) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-titel', wo));
      return [];
    }
    const datum = d.datum === undefined ? undefined : d.datum instanceof Date ? d.datum.toISOString().slice(0, 10) : str(d.datum);
    if (datum !== undefined && (!DATUM.test(datum) || new Date(`${datum}T12:00:00Z`).toISOString().slice(0, 10) !== datum)) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-datum', { ...wo, datum }));
      return [];
    }
    const register = d.register === undefined ? undefined : str(d.register);
    if (register !== undefined && !SCHLUESSEL.test(register)) {
      fehler.push(t('meldungen.pakete.beispiel-dokument-register', { ...wo, register }));
      return [];
    }
    inhalt.set(datei, daten);
    return [{ datei, ...(titel ? { titel } : {}), ...(datum ? { datum } : {}), ...(register ? { register } : {}) }];
  });
}

/**
 * Feldwerte eines Beispiels (#347): Beträge dürfen im Paket als Zahl stehen; Zeiträume als P3M oder { anzahl, einheit }
 * gleicht bereinigeWerte an (#1035). Verweise auf Beispiele und Vorgaben löst `aufloesen` auf; ohne Ziel bleibt das Feld leer.
 */
export async function beispielWerte(
  roh: Record<string, unknown>,
  felder: Feld[],
  aufloesen: (w: unknown) => Promise<string | undefined>,
): Promise<Record<string, unknown>> {
  const werte: Record<string, unknown> = {};
  for (const [k, w] of Object.entries(roh)) {
    const f = felder.find((x) => x.key === k);
    if (f?.typ === 'betrag' && typeof w === 'number') werte[k] = { betrag: w, waehrung: f.waehrung || 'EUR' };
    else if (Array.isArray(w) && w.some((x) => istBeispielVerweis(x) || istVorgabeWert(x))) {
      const l = (await Promise.all(w.map(aufloesen))).filter((x): x is string => !!x);
      if (l.length) werte[k] = l;
    } else if (istBeispielVerweis(w) || istVorgabeWert(w)) {
      const z = await aufloesen(w);
      if (z) werte[k] = f?.mehrfach ? [z] : z;
    } else werte[k] = w;
  }
  return werte;
}
