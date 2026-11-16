/**
 * Dokumente (#1278, aus `dokumente.routen.ts`): umgewandelte Fassungen und Vorschaubilder (#577), geschützte PDFs
 * entsperren (#827), Archivfassung und Wortpositionen (#631).
 */
import { FASSUNG_MAX_BYTES, VORSCHAUBILD_MAX_BYTES } from '../../../shared/src/dateiumwandlung';
import { KOERPER_SPIELRAUM } from '../grundlagen/grenzen';
import { ok, ich, b, privatZwischenspeichern } from '../http/routen-hilfen';
import { ARCHIVFASSUNG_MAX_BYTES, archivfassungName, pdfaName } from '../../../shared/src/archivfassung';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

export function dokumenteFassungenRouten(k: RoutenKontext): Route[] {
  const { dienst, mitnehmen, abgerufen, herausgeben, zumAbspeichern, fuerAnzeige, ausgabeDatei, zg, darf } = k;
  return [
    // Dateien umwandeln (#577): Fassung und Vorschaubild schreiben nur Pakete mit dms:umwandeln, die das Dokument lesen
    // dürfen (das Original bleibt unverändert, deshalb genügt Lesen); ansehen darf die Fassung, wer das Dokument liest.
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/fassung',
      zugang: 'angemeldet',
      roh: FASSUNG_MAX_BYTES + KOERPER_SPIELRAUM,
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.dokumentUmwandlung.setzeFassung(await zg(a), a.params.id, a.query.sha256, a.body));
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/vorschaubild',
      zugang: 'angemeldet',
      roh: VORSCHAUBILD_MAX_BYTES + KOERPER_SPIELRAUM,
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.dokumentUmwandlung.setzeVorschaubild(await zg(a), a.params.id, a.query.sha256, a.body));
      },
    },
    // Geschützte PDFs (#827): mit dem Passwort eine entsperrte Fassung anlegen. Das Passwort geht nur an qpdf (über die
    // Standardeingabe), nie in Datenbank, Protokoll oder Historie – außer mit „merken“ verschlüsselt im eigenen Konto.
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/entsperren',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(
          await dienst.geschuetztePdfs.entsperreDokument(a.params.id, ich(a).id, b(a), !a.apiSchluessel && !a.sitzungsDaten?.vertretungId),
        );
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/fassung',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
        const g = herausgeben(a)
          ? await dienst.ausgang.fassungFuerAusgabe(a.params.id, 'umgewandelt', { stempel: a.query, ich: ich(a) })
          : null;
        if (g)
          return abgerufen(
            a,
            a.params.id,
            { fassung: 'umgewandelt', gestempelt: true, datei: g.name },
            ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }),
          );
        const f = await dienst.dokumentUmwandlung.fassungVon(a.params.id);
        const punkt = f.d.name.lastIndexOf('.');
        const endung = f.info.mime === 'application/pdf' ? 'pdf' : f.info.mime === 'image/png' ? 'png' : 'jpg';
        const name = `${punkt > 0 ? f.d.name.slice(0, punkt) : f.d.name} (${f.info.entsperrt ? 'entsperrt' : 'umgewandelt'}).${endung}`;
        const antwort = await fuerAnzeige(a, {
          inhalt: f.inhalt,
          name,
          mime: f.info.mime,
          anzeigen: a.query.herunterladen === undefined,
          groesse: f.inhalt.length,
          koepfe: { 'x-dms-fassung-paket': `${f.info.paket.id} ${f.info.paket.version}`, 'cache-control': privatZwischenspeichern(60) },
        });
        return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'umgewandelt', datei: name }, antwort) : antwort;
      },
    },
    // Archivfassung (PDF/A, #631): ablegen nur Pakete mit dms:archivfassung, die das Dokument lesen dürfen (das Original
    // bleibt unverändert); ansehen, wer das Dokument liest. Wortpositionen ebenso mit Lesen (ohne weiteres Recht).
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/archivfassung',
      zugang: 'angemeldet',
      roh: ARCHIVFASSUNG_MAX_BYTES + KOERPER_SPIELRAUM,
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.dokumentArchiv.setzeArchivfassung(await zg(a), a.params.id, a.query.sha256, a.body));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/archivfassung',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
        // Mit API-Schlüssel ist das Herausgeben (#799): mit Pflicht- oder gewünschtem Stempel eine gestempelte Kopie.
        // Die gespeicherte Archivfassung bleibt unverändert; Pakete bekommen sie immer, wie sie ist.
        const g = herausgeben(a) ? await dienst.ausgang.fassungFuerAusgabe(a.params.id, 'archiv', { stempel: a.query, ich: ich(a) }) : null;
        if (g)
          return abgerufen(
            a,
            a.params.id,
            { fassung: 'archiv', gestempelt: true, datei: g.name },
            ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }),
          );
        const f = await dienst.dokumentArchiv.archivfassungVon(a.params.id);
        const name = f.info.imOriginal ? f.d.name : archivfassungName(f.d.name);
        const antwort = await fuerAnzeige(a, {
          inhalt: f.inhalt,
          name,
          mime: 'application/pdf',
          anzeigen: a.query.herunterladen === undefined,
          groesse: f.inhalt.length,
          koepfe: {
            'x-dms-archivfassung': `${pdfaName(f.info.pdfa)}; ${f.info.paket.id} ${f.info.paket.version}${f.info.imOriginal ? '; original' : ''}`,
            'cache-control': privatZwischenspeichern(60),
          },
        });
        return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'archiv', datei: name }, antwort) : antwort;
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/wortpositionen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        // ?fassung=archiv (#1137): aus der Textebene der Archivfassung (PDF/A), z. B. für E-Mails – Rechte wie oben.
        return ok(await dienst.dokumentArchiv.wortpositionen(a.params.id, a.query.fassung === 'archiv' ? { fassung: 'archiv' } : {}));
      },
    },
  ];
}
