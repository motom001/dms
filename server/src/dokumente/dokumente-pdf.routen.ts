/**
 * Dokumente (#1278, aus `dokumente.routen.ts`): PDF bearbeiten (#335), Schwärzen (#392), Verkleinern (#393),
 * Archivnummern (#345) und Dokument löschen.
 */
import { ok, privatZwischenspeichern, ich, b, quelle, L, leer } from '../http/routen-hilfen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import type { Antwort, Route } from '../http/routen-typen';
import { liesAnlass } from '../../../shared/src/loeschprotokoll';
import type { RoutenKontext } from '../http/routen-kontext';

export function dokumentePdfRouten(k: RoutenKontext): Route[] {
  return [...pdfBearbeitenRouten(k), ...schwaerzenRouten(k), ...verkleinernRouten(k), ...archivnummernRouten(k)];
}

/** PDF bearbeiten (#335): Seiten, Seitenbilder, bearbeiten und zusammenfügen. */
function pdfBearbeitenRouten(k: RoutenKontext): Route[] {
  const { dienst, abgerufen, herausgeben, seitenquelle, zg, darf } = k;
  return [
    /* PDF bearbeiten (#335): Seiten ansehen mit „Lesen“, bearbeiten mit „Bearbeiten“. */
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/seiten',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.pdfBearbeiten.pdfSeiten(a.params.id));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/seiten/:nr/bild',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        const q = await seitenquelle(a, mappeId);
        const bild = await dienst.pdfBearbeiten.pdfSeitenbild(a.params.id, Number(a.params.nr), q);
        if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
        const antwort: Antwort = {
          datei: {
            inhalt: bild,
            name: `seite-${a.params.nr}.jpg`,
            mime: 'image/jpeg',
            anzeigen: true,
            groesse: bild.length,
            koepfe: { 'cache-control': privatZwischenspeichern(3600) },
          },
        };
        // Seitenbilder über einen API-Schlüssel sind ein Abruf (#799, #800); in der Oberfläche nur Anzeige.
        return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/seiten',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        return ok(await dienst.pdfBearbeiten.bearbeitePdf(a.params.id, a.body, ich(a).id, await zg(a)), 201);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/zusammenfuegen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.pdfBearbeiten.fuegePdfZusammen(a.body, ich(a).id, await zg(a)), 201),
    },
  ];
}

/** Schwärzen (#392): Vorschau, Seitenbilder und Schwärzen. */
function schwaerzenRouten(k: RoutenKontext): Route[] {
  const { dienst, abgerufen, herausgeben, seitenquelle, darf } = k;
  return [
    /* Schwärzen (#392): Ansehen und Analyse mit „Lesen“, Schwärzen (neues Dokument bzw. Version) mit „Bearbeiten“. */
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/schwaerzen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.schwaerzen.schwaerzenVorschau(a.params.id));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/schwaerzen/seiten/:nr',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        const q = await seitenquelle(a, mappeId);
        // ?fassung=archiv (#934): die Seite der Archivfassung (PDF/A) – nicht mit Pflichtstempel, der gilt dem Original.
        const bild =
          a.query.fassung === 'archiv' && !q
            ? await dienst.schwaerzen.archivSeitenbild(a.params.id, Number(a.params.nr))
            : await dienst.schwaerzen.schwaerzSeitenbild(a.params.id, Number(a.params.nr), q);
        if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
        const antwort: Antwort = {
          datei: {
            inhalt: bild,
            name: `seite-${a.params.nr}.jpg`,
            mime: 'image/jpeg',
            anzeigen: true,
            groesse: bild.length,
            koepfe: { 'cache-control': privatZwischenspeichern(3600) },
          },
        };
        return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/schwaerzen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        return ok(await dienst.schwaerzen.schwaerzeDokument(a.params.id, a.body, ich(a).id), 201);
      },
    },
  ];
}

/** PDF verkleinern (#393): je Dokument und in der Werkbank. */
function verkleinernRouten(k: RoutenKontext): Route[] {
  const { dienst, darf } = k;
  return [
    /* PDF verkleinern (#393): Schätzung mit „Lesen“, Verkleinern (neue Version) mit „Bearbeiten“. */
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/verkleinern',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.pdfVerkleinern.verkleinernVorschau(a.params.id));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/verkleinern',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        const r = await dienst.pdfVerkleinern.verkleinereDokument(a.params.id, a.body, ich(a).id);
        return ok(r, r.unveraendert ? 200 : 201);
      },
    },
    {
      methode: 'GET',
      pfad: '/api/werkbank/verkleinern',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.pdfVerkleinern.grosseDokumente(a.query)),
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/verkleinern',
      zugang: 'admin',
      handler: async (a) =>
        ok(await dienst.auftraege.angemeldet(dienst.pdfVerkleinern.verkleinereViele(a.body, { id: ich(a).id, email: ich(a).email })), 202),
    },
    {
      methode: 'GET',
      pfad: '/api/werkbank/verkleinern/einstellung',
      zugang: 'admin',
      handler: async () => ok(await dienst.pdfVerkleinern.verkleinernEinstellung()),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/verkleinern/einstellung',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.pdfVerkleinern.setzeVerkleinernEinstellung(a.body)),
    },
  ];
}

/** Archivnummern (#345) und Dokument löschen. */
function archivnummernRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, darf } = k;
  return [
    /* Archivnummer (#345): setzen mit „Bearbeiten“, suchen mit „Lesen“, Aufkleber in der Werkbank. */
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/archivnummer',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        return ok(await dienst.mappenArchiv.setzeArchivnummer(a.params.id, (b(a) as { archivnummer?: unknown }).archivnummer, ich(a).id));
      },
    },
    {
      // Umbenennen (#1594): Bearbeiten an der Mappe; Endung, ursprünglicher Name, Historie und Archivmodus im Dienst.
      methode: 'PUT',
      pfad: '/api/dokumente/:id/name',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        return ok(await dienst.dokumente.benenneDokument(a.params.id, b(a), ich(a).id));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/archivnummern/:nr',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.mappenArchiv.findeArchivnummer(a.params.nr, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/archivnummern/aufkleber',
      zugang: 'admin',
      handler: async (a) => {
        const r = await dienst.mappenArchiv.archivAufkleber(a.body, ich(a).email);
        return {
          datei: {
            inhalt: r.pdf,
            name: t('meldungen.routen.archivnummern-bis-pdf', { erste: r.erste, letzte: r.letzte }),
            mime: 'application/pdf',
            anzeigen: false,
            groesse: r.pdf.length,
          },
        };
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/dokumente/:id',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'U');
        // Vorgaben (#1038): Ein Paket löscht keine Dokumente an Vorgaben anderer Pakete.
        await dienst.mappen.pruefeFremdeVorgabe(await zg(a), mappeId);
        const r = await dienst.dokumente.loescheDokument(a.params.id, ich(a).id, {
          ...liesAnlass({ ...a.query, ...b(a) }),
          ausloeser: quelle(a),
          weg: 'dokument',
        });
        L.dokumente.info(r.papierkorb ? 'Dokument in den Papierkorb gelegt' : 'Dokument gelöscht', { id: a.params.id });
        return leer;
      },
    },
  ];
}
