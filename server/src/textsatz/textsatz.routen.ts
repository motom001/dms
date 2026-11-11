/**
 * Text setzen (#1040): passende Vorlagen einer Mappe und Brief setzen – für die Oberfläche („Brief aus Vorlage“) und,
 * über /api/v1, für Pakete und API-Schlüssel. Ablegen braucht Bearbeiten an der Mappe; Herunterladen ist ein Weg nach
 * draußen und geht durch die gemeinsame Prüfstelle (`mitnehmen`, #723).
 */
import { L, ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Anfrage } from '../routen';
import type { Route } from '../routen';

export function textsatzRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, darf, mitnehmen } = k;
  const wer = async (a: Anfrage) => ({ ich: ich(a), z: await zg(a), paket: a.benutzer?.art === 'dienst' });
  return [
    { methode: 'GET', pfad: '/api/mappen/:id/vorlagen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.textsatz.vorlagen(await wer(a), a.params.id)) },
    { methode: 'POST', pfad: '/api/mappen/:id/vorlagen/:dokument/setzen', zugang: 'angemeldet', handler: async (a) => {
      const herunterladen = (a.body as { ziel?: unknown } | undefined)?.ziel === 'herunterladen';
      if (herunterladen) await mitnehmen(a, a.params.id); else await darf(a, a.params.id, 'U');
      const r = await dienst.textsatz.setze(await wer(a), a.params.id, a.params.dokument, a.body);
      if (r.art === 'pdf') {
        L.dokumente.info('Brief aus Vorlage heruntergeladen', { mappe: a.params.id, vorlage: a.params.dokument });
        return { datei: { inhalt: r.pdf, name: r.name, mime: 'application/pdf', anzeigen: false, groesse: r.pdf.length } };
      }
      return ok(r.ergebnis, 201);
    } },
  ];
}
