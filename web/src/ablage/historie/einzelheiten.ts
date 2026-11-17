import type { Historienart, Historieneintrag, Mappentyp } from '../../../../shared/src/model';
import { abruf, dokumentDatei, dokumentVersion, geschwaerzt, pdfBearbeitet, umgewandelt, volltext } from './einzelheiten-dokumente';
import { aenderungenTabelle, aufgabe, email, notiz, postGeteilt, uebernommen, wiederhergestellt, zugeordnet } from './einzelheiten-mappe';
import { auskunft, paketaktion } from './einzelheiten-weitere';
import type { Einzelheiten } from './hilfen';

/** Einzelheiten je Art des Eintrags (#80); fehlt die Art, gibt es nichts aufzuklappen. */
const JE_ART: Partial<Record<Historienart, (e: Historieneintrag, emailTyp: string | undefined) => Einzelheiten>> = {
  notiz,
  email,
  uebernommen,
  zugeordnet,
  aufgabe,
  dokument_version: dokumentVersion,
  dokument_hochgeladen: dokumentDatei,
  dokument_geloescht: dokumentDatei,
  dokument_papierkorb: dokumentDatei,
  pdf_bearbeitet: pdfBearbeitet,
  geschwaerzt,
  auskunft,
  paketaktion,
  volltext,
  umgewandelt,
  post_geteilt: postGeteilt,
  heruntergeladen: abruf,
  abruf_api: abruf,
  abruf_webdav: abruf,
  wiederhergestellt,
};

/**
 * Einzelheiten eines Eintrags und ein kurzer Hinweis, wie viel dahintersteckt; null = nichts aufzuklappen.
 * Exportiert für den Test (#1010).
 */
export function einzelheiten(e: Historieneintrag, emailTyp: string | undefined, typ?: Pick<Mappentyp, 'felder'>): Einzelheiten {
  if (e.daten.aenderungen?.length) return aenderungenTabelle(e, typ);
  return Object.hasOwn(JE_ART, e.art) ? (JE_ART[e.art]?.(e, emailTyp) ?? null) : null;
}
