/**
 * Mappentyp am Code erkennen (#1728): Seit #1723 merkt sich Ablago die Codes eines Dokuments (QR-Codes, Barcodes), und ein
 * Feld mit der Erkennungsart `code` nennt sein Code-Muster. Manche Codes stehen praktisch nur auf einer Art von
 * Dokument – der Link zum Digitalen Untersuchungsbericht nur auf dem HU-Bericht. Passt ein gemerkter Code auf das Muster
 * eines Felds von Mappentyp X, ist das in „Wohin gehört das?“ ein eigener Weg `code` mit starker Stimme für X – stärker als
 * „Woran man ihn erkennt“ oder die Überschrift. Ein eigenes Manifest-Feld braucht es nicht.
 *
 * Nur Felder mit `muster` zählen: Ein Feld ohne Muster nimmt jeden Code und sagt nichts über die Art des Dokuments.
 */
import { type GelesenerCode, passenderCode } from './codes';
import type { Klassbeleg } from './klassifizierung';
import type { Mappentyp } from './model/basis';

/** Gewicht des Wegs `code`: Das Muster ist genau, der Code exakt gelesen – fast so stark wie ein Weg sein kann. */
export const CODE_SICHERHEIT = 0.9;

/**
 * Belege des Wegs `code` je Kandidat: das erste Feld mit passendem Code (frühere Seite gewinnt). Passt derselbe Code auf
 * Felder mehrerer Typen, teilen sie sich die Stimme. `feld` ist die Beschriftung, `wort` die Art des Codes.
 */
export function codeBelege(
  ziele: ReadonlyArray<Pick<Mappentyp, 'id' | 'felder'>>,
  codes: readonly GelesenerCode[],
): Array<Klassbeleg & { typId: string }> {
  if (!codes.length) return [];
  const treffer: Array<{ typId: string; feld: string; code: GelesenerCode }> = [];
  for (const zt of ziele) {
    for (const f of zt.felder) {
      if (f.erkennung?.art !== 'code' || !f.erkennung.muster) continue;
      const code = passenderCode(f.erkennung, codes);
      if (!code) continue;
      treffer.push({ typId: zt.id, feld: f.label || f.key, code });
      break;
    }
  }
  return treffer.map(({ typId, feld, code }) => ({
    typId,
    weg: 'code' as const,
    sicherheit: Math.round((CODE_SICHERHEIT / treffer.length) * 100) / 100,
    feld,
    wort: code.art,
    ...(typeof code.seite === 'number' ? { seite: code.seite } : {}),
  }));
}
