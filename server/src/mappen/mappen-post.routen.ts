/**
 * Mappen (#1278, aus `mappen.routen.ts`): Post anlegen (#192) und fotografieren (#490), zusammenlegen, zuordnen,
 * abtrennen (#934) und abgleichen.
 */
import { MAX_DATEIGROESSE, POST_KANAL } from '../../../shared/src/model';
import { ok, b, quelle, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Post (#192) anlegen und fotografieren (#490). */
export function mappenPostRouten(k: RoutenKontext): Route[] {
  const { dienst, fotostapel, zg, darf } = k;
  return [
    // Post (#192): anlegen („+ Post“, Dokumente danach über das Hochladen) und einer Mappe zuordnen.
    {
      methode: 'POST',
      pfad: '/api/post',
      zugang: 'angemeldet',
      handler: async (a) => {
        const i = ich(a);
        return ok(
          await dienst.post.legePostAn(
            b(a),
            { id: i.id, name: i.name },
            await zg(a),
            a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen,
          ),
          201,
        );
      },
    },
    // Post fotografieren (#490): Fotos einzeln in den Stapel, „Fertig“ macht ein PDF daraus.
    {
      methode: 'POST',
      pfad: '/api/fotostapel',
      zugang: 'angemeldet',
      roh: MAX_DATEIGROESSE,
      handler: async (a) => ok({ id: await fotostapel.lege(ich(a).id, a.body) }, 201),
    },
    {
      methode: 'POST',
      pfad: '/api/post/fotos',
      zugang: 'angemeldet',
      handler: async (a) => {
        const i = ich(a);
        const ids = (b(a) as { stapel?: unknown }).stapel;
        const fotos = await fotostapel.nimm(i.id, ids);
        const r = await dienst.postFotos.postAusFotos(
          b(a),
          fotos,
          { id: i.id, name: i.name },
          await zg(a),
          a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen,
        );
        await fotostapel.weg(i.id, ids as string[]);
        return ok(r, 201);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/fotos',
      zugang: 'angemeldet',
      handler: async (a) => {
        // Erst das Recht an der Mappe (#1262), dann der eigene Fotostapel.
        await darf(a, a.params.id, 'U');
        const i = ich(a);
        const ids = (b(a) as { stapel?: unknown }).stapel;
        const fotos = await fotostapel.nimm(i.id, ids);
        const r = await dienst.postFotos.fotosAnMappe(a.params.id, b(a), fotos, i.id, await zg(a));
        await fotostapel.weg(i.id, ids as string[]);
        return ok(r, 201);
      },
    },
  ];
}

/** Post zusammenlegen, zuordnen, abtrennen (#934) und abgleichen. */
export function zuordnenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    {
      methode: 'POST',
      pfad: '/api/post/:id/zusammenlegen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.postFotos.legePostZusammen(a.params.id, b(a), ich(a).id, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/zuordnen',
      zugang: 'angemeldet',
      handler: async (a) => {
        // Aus Korrekturen lernen (#1681): den Absender vor dem Zuordnen lesen – danach ist die Post womöglich aufgelöst.
        const absender = await dienst.erkennung.gelerntes.absenderVon(a.params.id).catch(() => null);
        const r = await dienst.post.ordneZu(a.params.id, b(a), ich(a).id, await zg(a), undefined, quelle(a));
        await dienst.erkennung.gelerntes.lerneAusZuordnen(absender, a.params.id, b(a), ich(a).id).catch(() => undefined);
        return ok(r);
      },
    },
    // „Dokument übernehmen“ (#934): Folgedokumente als neue Post abtrennen; Abgleich mit vorhandenen Mappen (Belege, Doppelte, Typ).
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/abtrennen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.postAufloesen.trennePostAb(a.params.id, b(a), ich(a).id, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/abgleich',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const z = await zg(a);
        // Vorberechnet (#1567) für die drei wahrscheinlichsten Typen, sonst wie bisher.
        return ok((await dienst.erkennung.vorberechnung.abgleich(b(a), z)) ?? (await dienst.erkennung.abgleichDokumente(b(a), z)));
      },
    },
  ];
}
