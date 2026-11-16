/**
 * Dokumente (#1278, aus `dokumente.routen.ts`): Versionen (#194) und Anlagen (#998).
 */
import type { Anfrage, Route } from '../http/routen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { ok, ich, L } from '../http/routen-hilfen';
import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE } from '../../../shared/src/model';
import type { RoutenKontext } from '../http/routen-kontext';

export function dokumenteVersionenRouten(k: RoutenKontext): Route[] {
  const { dienst, weitergabe, mitnehmen, abgerufen, fuerAnzeige, ausgabeDatei, zg, darf } = k;
  /** Anlagen ändern (#998): Bearbeiten an der Mappe des Hauptdokuments; ein Paket nur mit dms:anlagen und nur in Post. */
  const anlagenRecht = async (a: Anfrage) => {
    const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
    await darf(a, mappeId, 'U');
    const z = await zg(a);
    if (!z?.paket) return;
    const m = await dienst.kern.repo.holeMappe(mappeId);
    const typ = m ? await dienst.kern.repo.holeTyp(m.typId) : undefined;
    if (!z.paket.schnittstellen?.includes('dms:anlagen') || typ?.system !== 'post')
      throw new Fachfehler(403, t('meldungen.anlagen.nur-pakete-mit-recht'));
  };
  return [
    /* Versionierung (#194): Ersetzen und Zurückholen mit dem Recht „Bearbeiten“, Versionen mit „Lesen“. */
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/versionen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.dokumentVersionen.versionen(a.params.id));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/versionen/:nummer/inhalt',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        const nummer = Number(a.params.nummer);
        if (weitergabe(a)) {
          await mitnehmen(a, mappeId);
          const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, {
            version: nummer,
            stempel: a.query,
            verkleinern: a.query.verkleinern,
            ich: ich(a),
          });
          return abgerufen(
            a,
            a.params.id,
            { fassung: 'version', version: nummer, gestempelt: r.gestempelt, datei: r.name },
            ausgabeDatei(r),
          );
        }
        const { version: v, inhalt } = await dienst.dokumentVersionen.versionInhalt(a.params.id, nummer);
        if (!v.anzeigbar) {
          try {
            await mitnehmen(a, mappeId);
          } catch (e) {
            if (!Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
            throw e;
          }
        }
        const anzeigen = v.anzeigbar;
        const antwort = await fuerAnzeige(a, {
          inhalt,
          name: v.name,
          mime: v.anzeigbar ? v.mime : 'application/octet-stream',
          anzeigen,
          groesse: v.groesse,
        });
        return anzeigen ? antwort : abgerufen(a, a.params.id, { fassung: 'version', version: nummer, datei: v.name }, antwort);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/ersetzen',
      zugang: 'angemeldet',
      roh: MAX_DATEIGROESSE,
      strom: true,
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        const d = await dienst.dokumentVersionen.ersetzeDokument(
          a.params.id,
          { name: a.query.name, typ: a.query.typ, herkunft: a.apiSchluessel ? 'api' : 'hochgeladen' },
          a.body,
          ich(a).id,
        );
        L.dokumente.info('Neue Version eines Dokuments', { name: d.name, id: d.id, version: d.version });
        return ok(d, 201);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        const d = await dienst.dokumentVersionen.holeVersionZurueck(a.params.id, Number(a.params.nummer), ich(a).id);
        L.dokumente.info('Ältere Version zurückgeholt', { name: d.name, id: d.id, version: d.version, von: Number(a.params.nummer) });
        return ok(d, 201);
      },
    },
    /*
     * Anlagen (#998): lesen mit „Lesen“, ändern mit „Bearbeiten“ an der Mappe – Anlagen liegen immer in der Mappe ihres
     * Hauptdokuments. Pakete ändern Anlagen nur mit dem Recht dms:anlagen und nur in Post.
     */
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/anlagen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.dokumentAnlagen.liste(a.params.id));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/anlagen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await anlagenRecht(a);
        return ok(await dienst.dokumentAnlagen.haengeAn(a.params.id, a.body, ich(a).id), 201);
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/anlagen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await anlagenRecht(a);
        return ok(await dienst.dokumentAnlagen.sortiere(a.params.id, a.body, ich(a).id));
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/anlagen/:anlage',
      zugang: 'angemeldet',
      handler: async (a) => {
        await anlagenRecht(a);
        return ok(await dienst.dokumentAnlagen.benenne(a.params.id, a.params.anlage, a.body, ich(a).id));
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/dokumente/:id/anlagen/:anlage',
      zugang: 'angemeldet',
      handler: async (a) => {
        await anlagenRecht(a);
        return ok(await dienst.dokumentAnlagen.loese(a.params.id, a.params.anlage, ich(a).id));
      },
    },
  ];
}
