/**
 * Dokumente (#1278, aus `dokumente.routen.ts`): Volltext und Texterkennung, Sprache, Hinweis „Post teilen?“,
 * Leerseiten, Vektoren und Seitenbilder für die Texterkennung.
 */
import { ok, ich, b, L } from '../http/routen-hilfen';
import { VOLLTEXT_KOERPER_MAX } from '../../../shared/src/paketvolltext';
import { t } from '../sprache/sprache';
import { hatSchnittstelle } from '../../../shared/src/pakete';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

export function dokumenteVolltextRouten(k: RoutenKontext): Route[] {
  return [...volltextRouten(k), ...leerseitenRouten(k), ...vektorenRouten(k), ...seitenRouten(k)];
}

/** Volltext lesen und schreiben (#45, #338, #614), Sprache (#400) und Hinweis „Post teilen?“ (#579). */
function volltextRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, darf } = k;
  return [
    // Volltext und Texterkennung (#45)
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/volltext',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        const r = await dienst.volltexte.volltext(a.params.id);
        return ok({
          id: r.dokument.id,
          name: r.dokument.name,
          ocr: r.dokument.ocr,
          sprache: r.dokument.sprache ?? null,
          weitereSprachen: r.dokument.weitereSprachen ?? [],
          text: r.text,
          ...(r.seiten ? { seiten: r.seiten } : {}),
        });
      },
    },
    // Volltext schreiben (#338): für Pakete wie die Texterkennung – Dienstkonto mit „Dokumente schreiben“ oder Recht Bearbeiten;
    // mit dms:volltext (#614) nur für die Dateitypen des Pakets. Bis zur Grenze des Kerns (5 Mio. Zeichen) in einer Anfrage.
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/volltext',
      zugang: 'angemeldet',
      roh: VOLLTEXT_KOERPER_MAX,
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
        if (a.benutzer?.art === 'dienst') await dienst.volltextAusPaketen.pruefeVolltextRecht(await zg(a), a.params.id);
        const p =
          a.benutzer?.art === 'dienst' ? (await dienst.kern.repo.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
        const herkunft = p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email });
        const d = await dienst.volltexte.schreibeVolltext(a.params.id, a.body, {
          id: ich(a).id,
          herkunft,
          paket: !!p,
          ausgelesen: !!p && hatSchnittstelle(p.laeufer, 'dms:volltext') && !hatSchnittstelle(p.laeufer, 'dms:texterkennung'),
        });
        return ok({ id: d.id, name: d.name, ocr: d.ocr, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [] });
      },
    },
    // Sprache des Volltexts (#400): bestimmt die Wortstämme der Suche – Rechte wie beim Volltext schreiben.
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/sprache',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
        if (a.benutzer?.art === 'dienst') await dienst.volltextAusPaketen.pruefeVolltextRecht(await zg(a), a.params.id);
        const p =
          a.benutzer?.art === 'dienst' ? (await dienst.kern.repo.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
        const d = await dienst.volltexte.setzeDokumentSprache(a.params.id, a.body, {
          id: ich(a).id,
          wer: p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email }),
        });
        return ok({ id: d.id, name: d.name, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [], ocr: d.ocr });
      },
    },
    // Hinweis „Post teilen?“ wegklicken (#579): wer teilen dürfte (Bearbeiten), darf ihn auch ausblenden.
    {
      methode: 'DELETE',
      pfad: '/api/dokumente/:id/teilen-hinweis',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        const d = await dienst.volltexte.teilenHinweisAus(a.params.id);
        return ok({ id: d.id, teilenAb: d.teilenAb ?? null });
      },
    },
  ];
}

/** Leerseiten (#997): lesen, markieren und je Seite wählen. */
function leerseitenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    // Leerseiten (#997): lesen mit Lesen an der Post; markieren nur Pakete mit dms:leerseiten (nur Markierung, nichts wird
    // gelöscht); je Seite wählen („Doch behalten“ / „Auch weglassen“) nur Menschen mit Bearbeiten. Rechte prüft der Dienst.
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/leerseiten',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.postLeerseiten.lies(await zg(a), a.params.id)),
    },
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/leerseiten',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.postLeerseiten.markiere(await zg(a), a.params.id, b(a))),
    },
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/leerseiten/:nr',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.postLeerseiten.waehleSeite(await zg(a), a.params.id, Number(a.params.nr), b(a))),
    },
  ];
}

/** Vektoren zu Dokumenten (#442) und ähnliche Dokumente. */
function vektorenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, darf } = k;
  return [
    // Vektoren zu Dokumenten (#442): schreiben nur Pakete mit dms:vektoren, die das Dokument lesen dürfen.
    {
      methode: 'PUT',
      pfad: '/api/dokumente/:id/vektor',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.suche.setzeVektor(await zg(a), a.params.id, (b(a) as { modell?: unknown }).modell, a.body));
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/dokumente/:id/vektor',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(await dienst.suche.loescheVektor(await zg(a), a.params.id, a.query.modell));
      },
    },
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/aehnliche',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
        return ok(
          await dienst.suche.aehnlicheDokumente(await zg(a), {
            dokument: a.params.id,
            modell: a.query.modell,
            anzahl: a.query.anzahl,
            schwelle: a.query.schwelle,
          }),
        );
      },
    },
    {
      methode: 'POST',
      pfad: '/api/vektoren/aehnliche',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const e = b(a) as { modell?: unknown; vektor?: unknown; anzahl?: unknown; schwelle?: unknown };
        return ok(
          await dienst.suche.aehnlicheDokumente(await zg(a), {
            modell: e.modell,
            vektor: e.vektor,
            anzahl: e.anzahl,
            schwelle: e.schwelle,
          }),
        );
      },
    },
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/aehnliche',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.suche.aehnlicheZurMappe(await zg(a), a.params.id)),
    },
  ];
}

/** Seite als Bild für die Texterkennung (#338, #716) und Texterkennung erneut anstoßen. */
function seitenRouten(k: RoutenKontext): Route[] {
  const { dienst, mitnehmen, abgerufen, seitenquelle, darf } = k;
  return [
    // Seite als Graustufenbild (#338): Eingabe für eine Texterkennung im Paket (PGM, 8 Bit).
    // Mit ?farbe=1 (#716) als Farbbild (PPM) – für die Archivfassung; wie das Graustufenbild nur mit Leserecht.
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/seiten/:nr/scan',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        // Rohbild der Seite zum Abspeichern: für Pakete (Dienstkonten) mit Lesen, für Menschen ist es Mitnehmen (#723).
        await mitnehmen(a, mappeId);
        const dpi = a.query.dpi === undefined ? 300 : Number(a.query.dpi);
        const farbe = a.query.farbe === '1' || a.query.farbe === 'true';
        // Mit API-Schlüssel und Stempel (#799): die Seite der gestempelten Kopie.
        const q = await seitenquelle(a, mappeId);
        const bild = await dienst.pdfBearbeiten.seiteAlsGraubild(a.params.id, Number(a.params.nr), dpi, farbe, q);
        return abgerufen(
          a,
          a.params.id,
          { fassung: 'seiten', gestempelt: !!q },
          {
            datei: {
              inhalt: bild,
              name: `seite-${a.params.nr}.${farbe ? 'ppm' : 'pgm'}`,
              mime: farbe ? 'image/x-portable-pixmap' : 'image/x-portable-graymap',
              anzeigen: false,
              groesse: bild.length,
            },
          },
        );
      },
    },
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/texterkennung',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
        const d = await dienst.volltexte.texterkennungErneut(a.params.id);
        L.dokumente.info('Texterkennung erneut angestoßen', { name: d.name, id: d.id });
        return ok(d);
      },
    },
  ];
}
