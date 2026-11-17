/**
 * Dokumente (#960: aus routen.ts): Ablegen, Abrufen, Fassungen, Volltext, Vektoren, Seiten, Versionen, Schwärzen,
 * Verkleinern und Archivnummern.
 */

import { MAX_DATEIGROESSE } from '../../../shared/src/model';

import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';

import { L, ok, ich, privatZwischenspeichern } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Antwort, Route } from '../http/routen-typen';
import { dokumenteFassungenRouten } from './dokumente-fassungen.routen';
import { dokumenteVolltextRouten } from './dokumente-volltext.routen';
import { dokumenteVersionenRouten } from './dokumente-versionen.routen';
import { dokumentePdfRouten } from './dokumente-pdf.routen';

export function dokumenteRouten(k: RoutenKontext): Route[] {
  return [
    ...ablegenRouten(k),
    ...inhaltRouten(k),
    ...herunterladenRouten(k),
    ...vorschauRouten(k),
    ...dokumenteFassungenRouten(k),
    ...dokumenteVolltextRouten(k),
    ...dokumenteVersionenRouten(k),
    ...dokumentePdfRouten(k),
  ];
}

/** Dokument hochladen und doppelte Dateien vor dem Hochladen erkennen (#333). */
function ablegenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg, darf } = k;
  return [
    /* ---------- Dokumente ---------- */
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/dokumente',
      zugang: 'angemeldet',
      roh: MAX_DATEIGROESSE,
      strom: true,
      handler: async (a) => {
        await darf(a, a.params.id, 'U');
        const r = await dienst.dokumente.ladeHoch(
          a.params.id,
          {
            register: a.query.register,
            name: a.query.name,
            typ: a.query.typ,
            gleicherName: a.query.gleicherName,
            herkunft: a.apiSchluessel ? 'api' : 'hochgeladen',
          },
          a.body,
          ich(a).id,
        );
        // Gleicher Inhalt (#333): nur Mappen, die der Benutzer lesen darf.
        const lesbar = await dienst.rechtepruefung.lesbare(
          await zg(a),
          r.gleicherInhalt.map((g) => g.mappeId),
        );
        r.gleicherInhalt = r.gleicherInhalt.filter((g) => lesbar.has(g.mappeId));
        L.dokumente.info('Dokument hochgeladen', {
          name: r.dokument.name,
          groesse: r.dokument.groesse,
          mime: r.dokument.mime,
          anzeigbar: r.dokument.anzeigbar,
          mappe: a.params.id,
          gleicherInhalt: r.gleicherInhalt.length || undefined,
        });
        return ok(r, 201);
      },
    },
    // Doppelte Dateien vor dem Hochladen erkennen (#333): Prüfwerte (SHA-256) → Fundstellen in lesbaren Mappen.
    {
      methode: 'POST',
      pfad: '/api/dokumente/gleiche',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const e = (a.body ?? {}) as { pruefwerte?: unknown; ohneMappe?: unknown };
        return ok({
          fundstellen: await dienst.eingangskanaele.fundstellen(
            await zg(a),
            e.pruefwerte,
            typeof e.ohneMappe === 'string' ? e.ohneMappe : undefined,
          ),
        });
      },
    },
  ];
}

/** Inhalt eines Dokuments anzeigen oder herunterladen (#394, #723, #800, #827). */
function inhaltRouten(k: RoutenKontext): Route[] {
  const { dienst, weitergabe, mitnehmen, abgerufen, fuerAnzeige, ausgabeDatei, darf } = k;
  return [
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/inhalt',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        // Herunterladen ist Weitergeben (#394): mit Stempel-Parametern oder Pflicht des Mappentyps gestempelt – und Mitnehmen (#723, Recht E).
        if (weitergabe(a) || a.query.fassung !== undefined) {
          await mitnehmen(a, mappeId);
          const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, {
            stempel: a.query,
            verkleinern: a.query.verkleinern,
            fassung: a.query.fassung,
            ich: ich(a),
          });
          return abgerufen(
            a,
            a.params.id,
            { fassung: a.query.fassung === 'archiv' ? 'archiv' : 'original', gestempelt: r.gestempelt, datei: r.name },
            ausgabeDatei(r),
          );
        }
        const d0 = await dienst.dokumente.holeDokument(a.params.id);
        // Was der Browser nicht anzeigen kann (Word, Excel …), kommt nur zum Abspeichern: auch das ist Mitnehmen (#723).
        if (!d0.anzeigbar) await mitnehmen(a, mappeId);
        const { dokument: d, inhalt } = await dienst.dokumente.dokumentInhalt(a.params.id);
        // Abspeichern ist Herunterladen (#800); Anzeigen in der Oberfläche nicht.
        if (!d.anzeigbar) {
          L.dokumente.debug('Dokument heruntergeladen', { name: d.name, id: d.id });
          return abgerufen(
            a,
            d.id,
            {},
            { datei: { inhalt, name: d.name, mime: 'application/octet-stream', anzeigen: false, groesse: d.groesse } },
          );
        }
        // Geschütztes PDF (#827): Angezeigt wird die entsperrte Fassung (bereinigt); Herunterladen liefert das Original.
        const frei =
          d.mime === 'application/pdf' && d.anzeigbar && !a.apiSchluessel
            ? await dienst.geschuetztePdfs.pdfEntsperren?.fassung(d.sha256).catch(() => null)
            : null;
        if (frei)
          return fuerAnzeige(a, {
            inhalt: frei.inhalt,
            name: d.name,
            mime: 'application/pdf',
            anzeigen: true,
            groesse: frei.inhalt.length,
            koepfe: { 'x-dms-entsperrt': '1' },
          });
        const anzeigen = d.anzeigbar;
        L.dokumente.debug(anzeigen ? 'Dokument angezeigt' : 'Dokument heruntergeladen', { name: d.name, id: d.id });
        return fuerAnzeige(a, {
          inhalt,
          name: d.name,
          mime: d.anzeigbar ? d.mime : 'application/octet-stream',
          anzeigen,
          groesse: d.groesse,
        });
      },
    },
  ];
}

/** Herunterladen mit Stempel aus der Oberfläche (#394), auch mit Anlagen (#998). */
function herunterladenRouten(k: RoutenKontext): Route[] {
  const { dienst, mitnehmen, abgerufen, ausgabeDatei, darf } = k;
  return [
    // Herunterladen mit Stempel aus der Oberfläche (#394): Angaben im Körper, sonst wie oben.
    {
      methode: 'POST',
      pfad: '/api/dokumente/:id/herunterladen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        await mitnehmen(a, mappeId);
        const e = (a.body ?? {}) as {
          stempel?: unknown;
          version?: unknown;
          verkleinern?: unknown;
          fassung?: unknown;
          mitAnlagen?: unknown;
          originalEmail?: unknown;
        };
        const version = e.version == null ? undefined : Number(e.version);
        // „mit Anlagen?“ (#998): das Dokument und seine Anlagen als ZIP – dieselbe Prüfstelle (oben), dieselbe Mappe.
        if (e.mitAnlagen === true && !Number.isInteger(version)) {
          const r = await dienst.ausgang.dokumentMitAnlagenFuerAusgabe(a.params.id, {
            stempel: e.stempel,
            verkleinern: e.verkleinern,
            fassung: e.fassung,
            originalEmail: e.originalEmail,
            ich: ich(a),
          });
          // Abruf (#800) für das Hauptdokument und je Anlage – mit Weg und Name des API-Schlüssels.
          return abgerufen(
            a,
            a.params.id,
            { fassung: e.fassung === 'archiv' ? 'archiv' : 'original', gestempelt: r.gestempelt, datei: r.name },
            ausgabeDatei(r),
            r.teile,
          );
        }
        const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, {
          stempel: e.stempel,
          verkleinern: e.verkleinern,
          fassung: e.fassung,
          version: Number.isInteger(version) ? version : undefined,
          ich: ich(a),
        });
        return abgerufen(
          a,
          a.params.id,
          {
            fassung: Number.isInteger(version) ? 'version' : e.fassung === 'archiv' ? 'archiv' : 'original',
            version: Number.isInteger(version) ? version : null,
            gestempelt: r.gestempelt,
            datei: r.name,
          },
          ausgabeDatei(r),
        );
      },
    },
  ];
}

/** Vorschaubild der ersten Seite (#332, #799). */
function vorschauRouten(k: RoutenKontext): Route[] {
  const { dienst, x, abgerufen, herausgeben, seitenquelle, darf } = k;
  return [
    // Vorschaubild der ersten Seite (#332): gleiche Rechte wie das Dokument; 404, solange es keins gibt.
    {
      methode: 'GET',
      pfad: '/api/dokumente/:id/vorschau',
      zugang: 'angemeldet',
      handler: async (a) => {
        const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
        await darf(a, mappeId, 'R');
        // Mit API-Schlüssel und Stempel (#799): Seite 1 der gestempelten Kopie statt des abgelegten Vorschaubilds.
        const q = await seitenquelle(a, mappeId);
        if (q) {
          const s1 = await dienst.pdfBearbeiten.pdfSeitenbild(a.params.id, 1, q);
          if (!s1) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
          return abgerufen(
            a,
            a.params.id,
            { fassung: 'seiten', gestempelt: true },
            {
              datei: {
                inhalt: s1,
                name: 'vorschau.jpg',
                mime: 'image/jpeg',
                anzeigen: true,
                groesse: s1.length,
                koepfe: { 'cache-control': 'no-store' },
              },
            },
          );
        }
        const d = await dienst.dokumente.holeDokument(a.params.id);
        const bild = x.vorschau ? await x.vorschau.bild(d) : null;
        if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
        // Die Adresse trägt den Prüfwert (?v=…): ein neues Bild hat eine neue Adresse, das Bild darf im Browser bleiben.
        const antwort: Antwort = {
          datei: {
            inhalt: bild,
            name: 'vorschau.jpg',
            mime: 'image/jpeg',
            anzeigen: true,
            groesse: bild.length,
            koepfe: { 'cache-control': privatZwischenspeichern(604800) },
          },
        };
        // Über einen API-Schlüssel ist auch das Vorschaubild ein Abruf (#800) – in der Oberfläche nicht.
        return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten' }, antwort) : antwort;
      },
    },
  ];
}
