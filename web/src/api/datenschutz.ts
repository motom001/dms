/** Schnittstelle (#1234): Datenschutz: Auskünfte, Löschprotokoll und was weg darf. */
import type { Aufgabe } from '../../../shared/src/model';
import type { Auftrag } from '../../../shared/src/auftrag';
import type { Luecke } from '../../../shared/src/loeschkonzept';
import type { LoeschEintrag } from '../../../shared/src/loeschprotokoll';
import type { AuskunftAuswahl, AuskunftEintrag, AuskunftLink, AuskunftStand, AuskunftVorschau, Datenschutz } from '../../../shared/src/auskunft';
import { anfrage } from './anfrage';

/** Werkbank → Datenschutz (#396, #455). */
export interface DatenschutzStand { einstellung: Datenschutz; auskuenfte: AuskunftStand[]; /** #668 */ verzeichnis: AuskunftEintrag[]; tage: number; links: AuskunftLink[]; adresse: string; oeffentlich: boolean; mail: boolean; /** #469 */ loeschkonzept?: { luecken: Luecke[] } }

export const datenschutzApi = {
  darfWeg: () => anfrage<Array<{ id: string; typId: string; typ: string; titel: string; aufbewahrenBis: string }>>('GET', '/api/werkbank/darf-weg'),
  /** Datenschutz: Auskunft nach Art. 15 DSGVO (#396). */
  datenschutz: () => anfrage<DatenschutzStand>('GET', '/api/werkbank/datenschutz'),
  /** Löschprotokoll (#470) */
  loeschprotokoll: (f: Record<string, string>) => anfrage<{ eintraege: LoeschEintrag[]; gesamt: number; jahre: number; max: number }>('GET', `/api/werkbank/loeschprotokoll?${new URLSearchParams(f)}`),
  loeschprotokollJahre: (jahre: number) => anfrage<{ jahre: number }>('PUT', '/api/werkbank/loeschprotokoll/einstellungen', { jahre }),
  /** Auskunft zustellen (#455): per E-Mail (nur verschlüsselt) oder als Abruf-Link mit Abrufcode. */
  auskunftEmail: (id: string, e: { an: string; betreff: string; nachricht: string }) => anfrage<{ an: string[] }>('POST', `/api/werkbank/auskunft/${id}/email`, e),
  auskunftLink: (id: string, e: { tage: number; abrufe: number; code?: string; an?: string; senden: boolean }) => anfrage<{ link: AuskunftLink; url: string; code: string; gesendet: boolean }>('POST', `/api/werkbank/auskunft/${id}/link`, e),
  auskunftLinkWiderrufen: (id: string) => anfrage<AuskunftLink>('POST', `/api/werkbank/auskunft/link/${id}/widerrufen`),
  setzeDatenschutz: (d: Datenschutz) => anfrage<Datenschutz>('PUT', '/api/werkbank/datenschutz', d),
  auskunftVorschau: (e: { mappeId: string; tiefe: number; richtungen: string[] }) => anfrage<AuskunftVorschau>('POST', '/api/werkbank/auskunft/vorschau', e),
  auskunftStarten: (e: { mappeId: string; tiefe: number; richtungen: string[]; auswahl: AuskunftAuswahl; geprueft: boolean; passwort: string; empfaenger: string; anmerkung: string }) => anfrage<Auftrag>('POST', '/api/werkbank/auskunft', e),
  auskunftFrist: (e: { mappeId: string; eingang: string }) => anfrage<Aufgabe>('POST', '/api/werkbank/auskunft/frist', e),
  auskunftLoeschen: (id: string) => anfrage<null>('DELETE', `/api/werkbank/auskunft/${id}`),
};
