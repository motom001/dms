import type { Feldaenderung, Historienart, Historieneintrag } from '../../../shared/src/model';
import type { KatalogArt } from '../../../shared/src/ereignisse';
import { protokoll } from '../protokoll';
import type { Kern } from './kern';

/** Historie → Ereignis des Katalogs (#670); Löschen meldet die Stelle selbst (die Mappe ist danach weg). */
const NOTIERT_ALS: Partial<Record<Historienart, KatalogArt>> = { angelegt: 'mappe.angelegt', geaendert: 'mappe.geaendert', wiederhergestellt: 'mappe.wiederhergestellt' };
/** Favorit = Abo (#422): Diese Historieneinträge sind Änderungen an der Mappe (Felder, Dokumente, Notizen, Register, Aufgaben). */
export const ABO_ARTEN = ['geaendert', 'dokument_hochgeladen', 'dokument_geloescht', 'dokument_version', 'dokument_papierkorb', 'dokument_wiederhergestellt',
  'pdf_bearbeitet', 'geschwaerzt', 'notiz', 'aufgabe', 'papierkorb', 'wiederhergestellt', 'zugeordnet', 'archivnummer'] as const satisfies readonly Historienart[];

/* ---------- Änderungshistorie (#57) schreiben; lesen gehört zu den Mappen ---------- */

export class Historie {
  constructor(private readonly kern: Kern) {}

  /** Ein Eintrag in die Historie einer Mappe – und bei Favoriten anderer die gebündelte Benachrichtigung (#422). */
  async schreibe(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) {
    await this.kern.repo.historieSchreibe([{ mappeId, benutzerId, art, daten }]);
    // Ereigniskatalog (#670): was in der Historie steht, ist auch ein Ereignis – nur mit Ids und Feldschlüsseln.
    const katalog = NOTIERT_ALS[art];
    if (katalog) {
      const felder = art === 'geaendert' ? [...new Set(((daten?.aenderungen ?? []) as Feldaenderung[]).map((a) => a.feld).filter((f) => !f.startsWith('_')))].sort() : undefined;
      if (art !== 'geaendert' || felder?.length) await this.kern.ereignis(katalog, { mappe: mappeId, typ: await this.kern.typVon(mappeId), ...(felder ? { felder } : {}) }, benutzerId);
    }
    // Favoriten (#422, #678): Das Melden übernimmt die Automatisierung „Favoriten-Änderungen melden“ (Paket
    // „Benachrichtigungen“). Ein Ereignis gibt es nur, wenn jemand anderes die Mappe als Favorit mit „benachrichtigen“ hat.
    if (benutzerId && (ABO_ARTEN as readonly string[]).includes(art) && daten?.aufgabenart !== 'aenderung') {
      try {
        if ((await this.kern.repo.favoritenDerMappe(mappeId)).some((f) => f.benachrichtigen && f.benutzerId !== benutzerId)) await this.kern.ereignis('favorit.geaendert', { mappe: mappeId, typ: await this.kern.typVon(mappeId), von: benutzerId }, benutzerId);
      } catch (e) { protokoll.modul('ablage').warn('Benachrichtigung zu Favoriten nicht angelegt', { mappeId, fehler: (e as Error).message }); }
    }
  }
}
