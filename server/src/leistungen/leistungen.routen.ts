/**
 * Leistungen (#1569): Katalog, Aufträge direkt und im Hintergrund, Stand eines Auftrags; dazu die Aufbewahrung
 * abgeschlossener Aufträge (Werkbank → Daten sichern → Einstellungen, Bereich `daten`). Pakete rufen Leistungen erst
 * mit #1571 über /api/v1 – mit den im Manifest angemeldeten Leistungen; bis dahin hier nur Personen.
 */
import type { Leistungsanfrage } from '../../../shared/src/leistungen';
import { Fachfehler } from '../grundlagen/fehler';
import type { RoutenKontext } from '../http/routen-kontext';
import { b, ich, ok } from '../http/routen-hilfen';
import type { Anfrage, Route } from '../http/routen-typen';
import { t } from '../sprache/sprache';

export function leistungenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  /** Eine Person mit ihrem Zugriff; Dienstkonten von Paketen nicht (#1571). */
  const wer = async (a: Anfrage) => {
    const i = ich(a);
    if (i.art) throw new Fachfehler(403, t('meldungen.leistungen.nur-personen'));
    return { fragender: { art: 'person' as const, ich: { id: i.id, rolle: i.rolle } }, z: await zg(a) };
  };
  const anfrage = (a: Anfrage): Leistungsanfrage => {
    const x = b(a);
    return {
      eingabe: x.eingabe as Record<string, unknown>,
      ...(x.kontext !== undefined ? { kontext: x.kontext } : {}),
      ...(x.ziel !== undefined ? { ziel: x.ziel as Leistungsanfrage['ziel'] } : {}),
    };
  };
  return [
    { methode: 'GET', pfad: '/api/leistungen', zugang: 'angemeldet', lesend: true, handler: async () => ok(dienst.leistungen.katalog()) },
    {
      methode: 'POST',
      pfad: '/api/leistungen/:name/abrufen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.leistungen.abrufen(await wer(a), a.params.name, anfrage(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/leistungen/:name/beauftragen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.leistungen.beauftragen(await wer(a), a.params.name, anfrage(a)), 202),
    },
    {
      methode: 'GET',
      pfad: '/api/leistungen/auftraege/:id',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.leistungen.auftrag(await wer(a), a.params.id)),
    },
    {
      methode: 'GET',
      pfad: '/api/werkbank/leistungen/einstellungen',
      zugang: 'admin',
      lesend: true,
      handler: async () => ok(await dienst.leistungen.einstellungen()),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/leistungen/einstellungen',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.leistungen.speichereEinstellungen(b(a))),
    },
  ];
}
