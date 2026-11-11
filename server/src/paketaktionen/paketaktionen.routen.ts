/**
 * Paket-Aktionen im Menü „Mappe“ (#1039): Aktionen einer Mappe, Start, nächster Schritt, Abbrechen, Datei abholen –
 * für Menschen (Sitzung mit `x-dms` bzw. API-Schlüssel), nie für Pakete selbst. Dazu die Schalter der Werkbank
 * (eingebaute Aktionen ausblenden, Aktionen eines Pakets ausschalten).
 */
import { Fachfehler } from '../fehler';
import { L, ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Anfrage, Route } from '../routen';
import { t } from '../sprache';

export function paketaktionenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, mitnehmen } = k;
  /** Person mit Zugriff; ein Dienstkonto (Paket) löst keine Paket-Aktion aus. */
  const wer = async (a: Anfrage) => {
    if (a.benutzer?.art) throw new Fachfehler(403, t('meldungen.paketaktionen.nicht-fuer-pakete'));
    const i = ich(a);
    return { ich: { id: i.id, rolle: i.rolle, name: i.name || i.email }, z: await zg(a) };
  };
  const pa = () => dienst.paketaktionen;
  return [
    { methode: 'GET', pfad: '/api/mappen/:id/paketaktionen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await pa().angebot(await wer(a), a.params.id)) },
    { methode: 'POST', pfad: '/api/mappen/:id/paketaktionen/:paket/:aktion', zugang: 'angemeldet', handler: async (a) => ok(await pa().starte(await wer(a), a.params.id, a.params.paket, a.params.aktion)) },
    { methode: 'POST', pfad: '/api/paketaktionen/laeufe/:lauf', zugang: 'angemeldet', handler: async (a) => ok(await pa().weiter(await wer(a), a.params.lauf, (a.body as { antworten?: unknown } | undefined)?.antworten)) },
    { methode: 'DELETE', pfad: '/api/paketaktionen/laeufe/:lauf', zugang: 'angemeldet', handler: async (a) => { await pa().abbrechen(await wer(a), a.params.lauf); return ok(null, 204); } },
    // Herausgeben ist Herunterladen (#723): Prüfstelle (Recht E, Spur im Verwaltungsmodus), immer als Anhang.
    { methode: 'POST', pfad: '/api/paketaktionen/laeufe/:lauf/datei', zugang: 'angemeldet', handler: async (a) => {
      const h = await wer(a);
      await mitnehmen(a, await pa().mappeVon(h, a.params.lauf));
      const d = await pa().datei(h, a.params.lauf);
      L.dokumente.info('Datei einer Paket-Aktion herausgegeben', { mappe: d.mappeId, groesse: d.inhalt.length });
      return { datei: { inhalt: d.inhalt, name: d.name, mime: d.mime, anzeigen: false, groesse: d.inhalt.length } };
    } },
    { methode: 'GET', pfad: '/api/werkbank/pakete/mappenaktionen', zugang: 'admin', handler: async () => ok(await pa().einstellung()) },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/mappenaktionen', zugang: 'admin', handler: async (a) => {
      const r = await pa().setzeEingebaute(a.body);
      L.werkbank.info('Eingebaute Aktionen im Menü „Mappe“ geändert', { aus: r.eingebautAus.join(', ') || '–' });
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/:id/mappenaktionen', zugang: 'admin', handler: async (a) => {
      const r = await pa().setzePaketAus(a.params.id, a.body);
      L.werkbank.info('Aktionen eines Pakets geändert', { paket: a.params.id, aus: (r.paketAus[a.params.id] ?? []).join(', ') || '–' });
      return ok(r);
    } },
  ];
}
