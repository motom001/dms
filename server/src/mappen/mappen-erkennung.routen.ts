/**
 * Mappen (#1278, aus `mappen.routen.ts`): „Wohin gehört das?“ (#939), „Aus Dokument ausfüllen“ (#391) und
 * Erkennung (#336).
 */
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { VORSCHLAG_DATEI_MAX } from '../grundlagen/grenzen';
import { ok, b } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** „Wohin gehört das?“ (#939), „Aus Dokument ausfüllen“ (#391) und Erkennung (#336). */
export function erkennungRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    // „Wohin gehört das?“ mehrstufig (#939): Pakete mit dms:klassifizieren, Kern-Erkennung und Abgleich – ein Vorschlag mit Belegen.
    {
      methode: 'POST',
      pfad: '/api/klassifizieren',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const z = await zg(a);
        // Vorberechnet (#1567): nur lesen, sonst wie bisher rechnen.
        return ok((await dienst.erkennung.vorberechnung.klass(b(a), z)) ?? (await dienst.erkennung.klassifizierung.klassifiziere(b(a), z)));
      },
    },
    // „Aus Dokument ausfüllen“ (#391): Vorschläge für die Felder eines Mappentyps aus Text, Dokumenten oder einer Datei.
    {
      methode: 'POST',
      pfad: '/api/typen/:id/vorschlaege',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const z = await zg(a);
        // Vorberechnet (#1567) für die drei wahrscheinlichsten Typen; Rechte prüft fuerTyp beim Rechnen, hier die Post.
        const v = await dienst.erkennung.vorberechnung.felder(a.params.id, b(a), z);
        const r = v ?? (await dienst.erkennung.fuerTyp(a.params.id, b(a), z));
        // Angebote von Paketen beim Ausfüllen (#1724): je Person, nie vorberechnet.
        const angebote = await dienst.ausfuellAngebote.fuer(z, a.params.id, b(a));
        return ok(angebote.length ? { ...r, angebote } : r);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/typen/:id/vorschlaege/datei',
      zugang: 'angemeldet',
      lesend: true,
      roh: VORSCHLAG_DATEI_MAX,
      handler: async (a) => {
        const z = await zg(a);
        if (!Buffer.isBuffer(a.body) || !a.body.length) throw new Fachfehler(422, t('meldungen.routen.die-datei-ist-leer'));
        // Erst Zugriff prüfen, dann die (teure) Texterkennung.
        await dienst.erkennung.fuerTyp(a.params.id, { mappe: a.query.mappe }, z);
        // E-Rechnung (#1043): XML direkt, im PDF aus dem Anhang – ihre Angaben gehen vor.
        const { text, info, erechnung } = await dienst.erkennung.dateiLesen(a.body, String(a.query.name ?? ''), String(a.query.typ ?? ''));
        return ok({
          ...(await dienst.erkennung.fuerTyp(
            a.params.id,
            { text, mappe: a.query.mappe, positionen: a.query.positionen === '1' || a.query.positionen === 'true' },
            z,
            { erechnung },
          )),
          text: text.slice(0, 200_000),
          info,
        });
      },
    },
    {
      methode: 'GET',
      pfad: '/api/typen/:id/erkennungsschema',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.erkennung.schema(a.params.id, await zg(a))),
    },
    // Erkennung (#336): Vorschläge beim Zuordnen; POST rechnet neu (z. B. nach dem Anlegen einer Organisation).
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/erkennung',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.erkennung.fuerBenutzer(a.params.id, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/erkennung',
      zugang: 'angemeldet',
      handler: async (a) => {
        const z = await zg(a);
        await dienst.rechtepruefung.pruefeRecht(z, a.params.id, 'R');
        await dienst.erkennung.fuerPost(a.params.id);
        // „Erkennung neu starten“ (#1567): auch die Vorberechnung, selbst bei „Nichts von sich aus“ – die Person hat es verlangt.
        await dienst.erkennung.vorberechnung.rechne(a.params.id, { auchWennAus: true });
        return ok(await dienst.erkennung.fuerBenutzer(a.params.id, z));
      },
    },
  ];
}
