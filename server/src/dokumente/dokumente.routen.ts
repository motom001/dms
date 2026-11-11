/**
 * Dokumente (#960: aus routen.ts): Ablegen, Abrufen, Fassungen, Volltext, Vektoren, Seiten, Versionen, Schwärzen,
 * Verkleinern und Archivnummern.
 */
import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE } from '../../../shared/src/model';
import { VOLLTEXT_KOERPER_MAX } from '../../../shared/src/paketvolltext';
import { ARCHIVFASSUNG_MAX_BYTES, archivfassungName, pdfaName } from '../../../shared/src/archivfassung';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { liesAnlass } from '../../../shared/src/loeschprotokoll';
import { hatSchnittstelle } from '../../../shared/src/pakete';
import { FASSUNG_MAX_BYTES, VORSCHAUBILD_MAX_BYTES } from '../../../shared/src/dateiumwandlung';
import { KOERPER_SPIELRAUM } from '../grenzen';
import { L, ok, leer, b, quelle, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Antwort, Route } from '../routen';

export function dokumenteRouten(k: RoutenKontext): Route[] {
  const { dienst, x, weitergabe, mitnehmen, abgerufen, herausgeben, seitenquelle, zumAbspeichern, fuerAnzeige, ausgabeDatei, zg, darf } = k;
  return [
    /* ---------- Dokumente ---------- */
    { methode: 'POST', pfad: '/api/mappen/:id/dokumente', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, strom: true, handler: async (a) => {
      await darf(a, a.params.id, 'U');
      const r = await dienst.dokumente.ladeHoch(a.params.id, { register: a.query.register, name: a.query.name, typ: a.query.typ, gleicherName: a.query.gleicherName, herkunft: a.apiSchluessel ? 'api' : 'hochgeladen' }, a.body, ich(a).id);
      // Gleicher Inhalt (#333): nur Mappen, die der Benutzer lesen darf.
      const lesbar = await dienst.rechtepruefung.lesbare(await zg(a), r.gleicherInhalt.map((g) => g.mappeId));
      r.gleicherInhalt = r.gleicherInhalt.filter((g) => lesbar.has(g.mappeId));
      L.dokumente.info('Dokument hochgeladen', {
        name: r.dokument.name, groesse: r.dokument.groesse, mime: r.dokument.mime, anzeigbar: r.dokument.anzeigbar,
        mappe: a.params.id, gleicherInhalt: r.gleicherInhalt.length || undefined,
      });
      return ok(r, 201);
    } },
    // Doppelte Dateien vor dem Hochladen erkennen (#333): Prüfwerte (SHA-256) → Fundstellen in lesbaren Mappen.
    { methode: 'POST', pfad: '/api/dokumente/gleiche', zugang: 'angemeldet', lesend: true, handler: async (a) => {
      const e = (a.body ?? {}) as { pruefwerte?: unknown; ohneMappe?: unknown };
      return ok({ fundstellen: await dienst.eingangskanaele.fundstellen(await zg(a), e.pruefwerte, typeof e.ohneMappe === 'string' ? e.ohneMappe : undefined) });
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Herunterladen ist Weitergeben (#394): mit Stempel-Parametern oder Pflicht des Mappentyps gestempelt – und Mitnehmen (#723, Recht E).
      if (weitergabe(a) || a.query.fassung !== undefined) {
        await mitnehmen(a, mappeId);
        const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, { stempel: a.query, verkleinern: a.query.verkleinern, fassung: a.query.fassung, ich: ich(a) });
        return abgerufen(a, a.params.id, { fassung: a.query.fassung === 'archiv' ? 'archiv' : 'original', gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
      }
      const d0 = await dienst.dokumente.holeDokument(a.params.id);
      // Was der Browser nicht anzeigen kann (Word, Excel …), kommt nur zum Abspeichern: auch das ist Mitnehmen (#723).
      if (!d0.anzeigbar) await mitnehmen(a, mappeId);
      const { dokument: d, inhalt } = await dienst.dokumente.dokumentInhalt(a.params.id);
      // Abspeichern ist Herunterladen (#800); Anzeigen in der Oberfläche nicht.
      if (!d.anzeigbar) {
        L.dokumente.debug('Dokument heruntergeladen', { name: d.name, id: d.id });
        return abgerufen(a, d.id, {}, { datei: { inhalt, name: d.name, mime: 'application/octet-stream', anzeigen: false, groesse: d.groesse } });
      }
      // Geschütztes PDF (#827): Angezeigt wird die entsperrte Fassung (bereinigt); Herunterladen liefert das Original.
      const frei = d.mime === 'application/pdf' && d.anzeigbar && !a.apiSchluessel ? await dienst.geschuetztePdfs.pdfEntsperren?.fassung(d.sha256).catch(() => null) : null;
      if (frei) return fuerAnzeige(a, { inhalt: frei.inhalt, name: d.name, mime: 'application/pdf', anzeigen: true, groesse: frei.inhalt.length, koepfe: { 'x-dms-entsperrt': '1' } });
      const anzeigen = d.anzeigbar;
      L.dokumente.debug(anzeigen ? 'Dokument angezeigt' : 'Dokument heruntergeladen', { name: d.name, id: d.id });
      return fuerAnzeige(a, { inhalt, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen, groesse: d.groesse });
    } },
    // Herunterladen mit Stempel aus der Oberfläche (#394): Angaben im Körper, sonst wie oben.
    { methode: 'POST', pfad: '/api/dokumente/:id/herunterladen', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      await mitnehmen(a, mappeId);
      const e = (a.body ?? {}) as { stempel?: unknown; version?: unknown; verkleinern?: unknown; fassung?: unknown };
      const version = e.version == null ? undefined : Number(e.version);
      const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, { stempel: e.stempel, verkleinern: e.verkleinern, fassung: e.fassung, version: Number.isInteger(version) ? version : undefined, ich: ich(a) });
      return abgerufen(a, a.params.id, { fassung: Number.isInteger(version) ? 'version' : e.fassung === 'archiv' ? 'archiv' : 'original', version: Number.isInteger(version) ? version : null, gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
    } },
    // Vorschaubild der ersten Seite (#332): gleiche Rechte wie das Dokument; 404, solange es keins gibt.
    { methode: 'GET', pfad: '/api/dokumente/:id/vorschau', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Mit API-Schlüssel und Stempel (#799): Seite 1 der gestempelten Kopie statt des abgelegten Vorschaubilds.
      const q = await seitenquelle(a, mappeId);
      if (q) {
        const s1 = await dienst.pdfBearbeiten.pdfSeitenbild(a.params.id, 1, q);
        if (!s1) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
        return abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: true }, { datei: { inhalt: s1, name: 'vorschau.jpg', mime: 'image/jpeg', anzeigen: true, groesse: s1.length, koepfe: { 'cache-control': 'no-store' } } });
      }
      const d = await dienst.dokumente.holeDokument(a.params.id);
      const bild = x.vorschau ? await x.vorschau.bild(d) : null;
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
      // Die Adresse trägt den Prüfwert (?v=…): ein neues Bild hat eine neue Adresse, das Bild darf im Browser bleiben.
      const antwort: Antwort = { datei: { inhalt: bild, name: 'vorschau.jpg', mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-604800') } } };
      // Über einen API-Schlüssel ist auch das Vorschaubild ein Abruf (#800) – in der Oberfläche nicht.
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten' }, antwort) : antwort;
    } },
    // Dateien umwandeln (#577): Fassung und Vorschaubild schreiben nur Pakete mit dms:umwandeln, die das Dokument lesen
    // dürfen (das Original bleibt unverändert, deshalb genügt Lesen); ansehen darf die Fassung, wer das Dokument liest.
    { methode: 'PUT', pfad: '/api/dokumente/:id/fassung', zugang: 'angemeldet', roh: FASSUNG_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.dokumentUmwandlung.setzeFassung(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    { methode: 'PUT', pfad: '/api/dokumente/:id/vorschaubild', zugang: 'angemeldet', roh: VORSCHAUBILD_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.dokumentUmwandlung.setzeVorschaubild(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    // Geschützte PDFs (#827): mit dem Passwort eine entsperrte Fassung anlegen. Das Passwort geht nur an qpdf (über die
    // Standardeingabe), nie in Datenbank, Protokoll oder Historie – außer mit „merken“ verschlüsselt im eigenen Konto.
    { methode: 'POST', pfad: '/api/dokumente/:id/entsperren', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.geschuetztePdfs.entsperreDokument(a.params.id, ich(a).id, b(a), !a.apiSchluessel && !a.sitzungsDaten?.vertretungId));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/fassung', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
      const g = herausgeben(a) ? await dienst.ausgang.fassungFuerAusgabe(a.params.id, 'umgewandelt', { stempel: a.query, ich: ich(a) }) : null;
      if (g) return abgerufen(a, a.params.id, { fassung: 'umgewandelt', gestempelt: true, datei: g.name }, ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }));
      const f = await dienst.dokumentUmwandlung.fassungVon(a.params.id);
      const punkt = f.d.name.lastIndexOf('.');
      const endung = f.info.mime === 'application/pdf' ? 'pdf' : f.info.mime === 'image/png' ? 'png' : 'jpg';
      const name = `${punkt > 0 ? f.d.name.slice(0, punkt) : f.d.name} (${f.info.entsperrt ? 'entsperrt' : 'umgewandelt'}).${endung}`;
      const antwort = await fuerAnzeige(a, { inhalt: f.inhalt, name, mime: f.info.mime, anzeigen: a.query.herunterladen === undefined, groesse: f.inhalt.length,
        koepfe: { 'x-dms-fassung-paket': `${f.info.paket.id} ${f.info.paket.version}`, 'cache-control': t('meldungen.routen.private-max-age-60') } });
      return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'umgewandelt', datei: name }, antwort) : antwort;
    } },
    // Archivfassung (PDF/A, #631): ablegen nur Pakete mit dms:archivfassung, die das Dokument lesen dürfen (das Original
    // bleibt unverändert); ansehen, wer das Dokument liest. Wortpositionen ebenso mit Lesen (ohne weiteres Recht).
    { methode: 'PUT', pfad: '/api/dokumente/:id/archivfassung', zugang: 'angemeldet', roh: ARCHIVFASSUNG_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.dokumentArchiv.setzeArchivfassung(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/archivfassung', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
      // Mit API-Schlüssel ist das Herausgeben (#799): mit Pflicht- oder gewünschtem Stempel eine gestempelte Kopie.
      // Die gespeicherte Archivfassung bleibt unverändert; Pakete bekommen sie immer, wie sie ist.
      const g = herausgeben(a) ? await dienst.ausgang.fassungFuerAusgabe(a.params.id, 'archiv', { stempel: a.query, ich: ich(a) }) : null;
      if (g) return abgerufen(a, a.params.id, { fassung: 'archiv', gestempelt: true, datei: g.name }, ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }));
      const f = await dienst.dokumentArchiv.archivfassungVon(a.params.id);
      const name = f.info.imOriginal ? f.d.name : archivfassungName(f.d.name);
      const antwort = await fuerAnzeige(a, { inhalt: f.inhalt, name, mime: 'application/pdf', anzeigen: a.query.herunterladen === undefined, groesse: f.inhalt.length,
        koepfe: { 'x-dms-archivfassung': `${pdfaName(f.info.pdfa)}; ${f.info.paket.id} ${f.info.paket.version}${f.info.imOriginal ? '; original' : ''}`, 'cache-control': t('meldungen.routen.private-max-age-60') } });
      return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'archiv', datei: name }, antwort) : antwort;
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/wortpositionen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.dokumentArchiv.wortpositionen(a.params.id));
    } },
    // Volltext und Texterkennung (#45)
    { methode: 'GET', pfad: '/api/dokumente/:id/volltext', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      const r = await dienst.volltexte.volltext(a.params.id);
      return ok({ id: r.dokument.id, name: r.dokument.name, ocr: r.dokument.ocr, sprache: r.dokument.sprache ?? null, weitereSprachen: r.dokument.weitereSprachen ?? [], text: r.text, ...(r.seiten ? { seiten: r.seiten } : {}) });
    } },
    // Volltext schreiben (#338): für Pakete wie die Texterkennung – Dienstkonto mit „Dokumente schreiben“ oder Recht Bearbeiten;
    // mit dms:volltext (#614) nur für die Dateitypen des Pakets. Bis zur Grenze des Kerns (5 Mio. Zeichen) in einer Anfrage.
    { methode: 'PUT', pfad: '/api/dokumente/:id/volltext', zugang: 'angemeldet', roh: VOLLTEXT_KOERPER_MAX, handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
      if (a.benutzer?.art === 'dienst') await dienst.volltextAusPaketen.pruefeVolltextRecht(await zg(a), a.params.id);
      const p = a.benutzer?.art === 'dienst' ? (await dienst.kern.repo.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
      const herkunft = p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email });
      const d = await dienst.volltexte.schreibeVolltext(a.params.id, a.body, { id: ich(a).id, herkunft, paket: !!p, ausgelesen: !!p && hatSchnittstelle(p.laeufer, 'dms:volltext') && !hatSchnittstelle(p.laeufer, 'dms:texterkennung') });
      return ok({ id: d.id, name: d.name, ocr: d.ocr, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [] });
    } },
    // Sprache des Volltexts (#400): bestimmt die Wortstämme der Suche – Rechte wie beim Volltext schreiben.
    { methode: 'PUT', pfad: '/api/dokumente/:id/sprache', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
      if (a.benutzer?.art === 'dienst') await dienst.volltextAusPaketen.pruefeVolltextRecht(await zg(a), a.params.id);
      const p = a.benutzer?.art === 'dienst' ? (await dienst.kern.repo.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
      const d = await dienst.volltexte.setzeDokumentSprache(a.params.id, a.body, { id: ich(a).id, wer: p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email }) });
      return ok({ id: d.id, name: d.name, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [], ocr: d.ocr });
    } },
    // Hinweis „Post teilen?“ wegklicken (#579): wer teilen dürfte (Bearbeiten), darf ihn auch ausblenden.
    { methode: 'DELETE', pfad: '/api/dokumente/:id/teilen-hinweis', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.volltexte.teilenHinweisAus(a.params.id);
      return ok({ id: d.id, teilenAb: d.teilenAb ?? null });
    } },
    // Vektoren zu Dokumenten (#442): schreiben nur Pakete mit dms:vektoren, die das Dokument lesen dürfen.
    { methode: 'PUT', pfad: '/api/dokumente/:id/vektor', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.suche.setzeVektor(await zg(a), a.params.id, (b(a) as { modell?: unknown }).modell, a.body));
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id/vektor', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.suche.loescheVektor(await zg(a), a.params.id, a.query.modell));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/aehnliche', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.suche.aehnlicheDokumente(await zg(a), { dokument: a.params.id, modell: a.query.modell, anzahl: a.query.anzahl, schwelle: a.query.schwelle }));
    } },
    { methode: 'POST', pfad: '/api/vektoren/aehnliche', zugang: 'angemeldet', lesend: true, handler: async (a) => {
      const e = b(a) as { modell?: unknown; vektor?: unknown; anzahl?: unknown; schwelle?: unknown };
      return ok(await dienst.suche.aehnlicheDokumente(await zg(a), { modell: e.modell, vektor: e.vektor, anzahl: e.anzahl, schwelle: e.schwelle }));
    } },
    { methode: 'GET', pfad: '/api/mappen/:id/aehnliche', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.suche.aehnlicheZurMappe(await zg(a), a.params.id)) },
    // Seite als Graustufenbild (#338): Eingabe für eine Texterkennung im Paket (PGM, 8 Bit).
    // Mit ?farbe=1 (#716) als Farbbild (PPM) – für die Archivfassung; wie das Graustufenbild nur mit Leserecht.
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/scan', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Rohbild der Seite zum Abspeichern: für Pakete (Dienstkonten) mit Lesen, für Menschen ist es Mitnehmen (#723).
      await mitnehmen(a, mappeId);
      const dpi = a.query.dpi === undefined ? 300 : Number(a.query.dpi);
      const farbe = a.query.farbe === '1' || a.query.farbe === 'true';
      // Mit API-Schlüssel und Stempel (#799): die Seite der gestempelten Kopie.
      const q = await seitenquelle(a, mappeId);
      const bild = await dienst.pdfBearbeiten.seiteAlsGraubild(a.params.id, Number(a.params.nr), dpi, farbe, q);
      return abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, { datei: { inhalt: bild, name: `seite-${a.params.nr}.${farbe ? 'ppm' : 'pgm'}`, mime: farbe ? 'image/x-portable-pixmap' : 'image/x-portable-graymap', anzeigen: false, groesse: bild.length } });
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/texterkennung', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.volltexte.texterkennungErneut(a.params.id);
      L.dokumente.info('Texterkennung erneut angestoßen', { name: d.name, id: d.id });
      return ok(d);
    } },
    /* Versionierung (#194): Ersetzen und Zurückholen mit dem Recht „Bearbeiten“, Versionen mit „Lesen“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/versionen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.dokumentVersionen.versionen(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/versionen/:nummer/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const nummer = Number(a.params.nummer);
      if (weitergabe(a)) {
        await mitnehmen(a, mappeId);
        const r = await dienst.ausgang.dokumentFuerAusgabe(a.params.id, { version: nummer, stempel: a.query, verkleinern: a.query.verkleinern, ich: ich(a) });
        return abgerufen(a, a.params.id, { fassung: 'version', version: nummer, gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
      }
      const { version: v, inhalt } = await dienst.dokumentVersionen.versionInhalt(a.params.id, nummer);
      if (!v.anzeigbar) {
        try { await mitnehmen(a, mappeId); } catch (e) { if (!Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy(); throw e; }
      }
      const anzeigen = v.anzeigbar;
      const antwort = await fuerAnzeige(a, { inhalt, name: v.name, mime: v.anzeigbar ? v.mime : 'application/octet-stream', anzeigen, groesse: v.groesse });
      return anzeigen ? antwort : abgerufen(a, a.params.id, { fassung: 'version', version: nummer, datei: v.name }, antwort);
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/ersetzen', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, strom: true, handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.dokumentVersionen.ersetzeDokument(a.params.id, { name: a.query.name, typ: a.query.typ, herkunft: a.apiSchluessel ? 'api' : 'hochgeladen' }, a.body, ich(a).id);
      L.dokumente.info('Neue Version eines Dokuments', { name: d.name, id: d.id, version: d.version });
      return ok(d, 201);
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.dokumentVersionen.holeVersionZurueck(a.params.id, Number(a.params.nummer), ich(a).id);
      L.dokumente.info('Ältere Version zurückgeholt', { name: d.name, id: d.id, version: d.version, von: Number(a.params.nummer) });
      return ok(d, 201);
    } },
    /* PDF bearbeiten (#335): Seiten ansehen mit „Lesen“, bearbeiten mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.pdfBearbeiten.pdfSeiten(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/bild', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const q = await seitenquelle(a, mappeId);
      const bild = await dienst.pdfBearbeiten.pdfSeitenbild(a.params.id, Number(a.params.nr), q);
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
      const antwort: Antwort = { datei: { inhalt: bild, name: `seite-${a.params.nr}.jpg`, mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-3600') } } };
      // Seitenbilder über einen API-Schlüssel sind ein Abruf (#799, #800); in der Oberfläche nur Anzeige.
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/seiten', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.pdfBearbeiten.bearbeitePdf(a.params.id, a.body, ich(a).id, await zg(a)), 201);
    } },
    { methode: 'POST', pfad: '/api/dokumente/zusammenfuegen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.pdfBearbeiten.fuegePdfZusammen(a.body, ich(a).id, await zg(a)), 201) },
    /* Schwärzen (#392): Ansehen und Analyse mit „Lesen“, Schwärzen (neues Dokument bzw. Version) mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.schwaerzen.schwaerzenVorschau(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen/seiten/:nr', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const q = await seitenquelle(a, mappeId);
      // ?fassung=archiv (#934): die Seite der Archivfassung (PDF/A) – nicht mit Pflichtstempel, der gilt dem Original.
      const bild = a.query.fassung === 'archiv' && !q ? await dienst.schwaerzen.archivSeitenbild(a.params.id, Number(a.params.nr)) : await dienst.schwaerzen.schwaerzSeitenbild(a.params.id, Number(a.params.nr), q);
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
      const antwort: Antwort = { datei: { inhalt: bild, name: `seite-${a.params.nr}.jpg`, mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-3600') } } };
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/schwaerzen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.schwaerzen.schwaerzeDokument(a.params.id, a.body, ich(a).id), 201);
    } },
    /* PDF verkleinern (#393): Schätzung mit „Lesen“, Verkleinern (neue Version) mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/verkleinern', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.pdfVerkleinern.verkleinernVorschau(a.params.id));
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/verkleinern', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      const r = await dienst.pdfVerkleinern.verkleinereDokument(a.params.id, a.body, ich(a).id);
      return ok(r, r.unveraendert ? 200 : 201);
    } },
    { methode: 'GET', pfad: '/api/werkbank/verkleinern', zugang: 'admin', handler: async (a) => ok(await dienst.pdfVerkleinern.grosseDokumente(a.query)) },
    { methode: 'POST', pfad: '/api/werkbank/verkleinern', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.pdfVerkleinern.verkleinereViele(a.body, { id: ich(a).id, email: ich(a).email })), 202) },
    { methode: 'GET', pfad: '/api/werkbank/verkleinern/einstellung', zugang: 'admin', handler: async () => ok(await dienst.pdfVerkleinern.verkleinernEinstellung()) },
    { methode: 'PUT', pfad: '/api/werkbank/verkleinern/einstellung', zugang: 'admin', handler: async (a) => ok(await dienst.pdfVerkleinern.setzeVerkleinernEinstellung(a.body)) },
    /* Archivnummer (#345): setzen mit „Bearbeiten“, suchen mit „Lesen“, Aufkleber in der Werkbank. */
    { methode: 'PUT', pfad: '/api/dokumente/:id/archivnummer', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.rechtepruefung.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.mappenArchiv.setzeArchivnummer(a.params.id, (b(a) as { archivnummer?: unknown }).archivnummer, ich(a).id));
    } },
    { methode: 'GET', pfad: '/api/archivnummern/:nr', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappenArchiv.findeArchivnummer(a.params.nr, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/archivnummern/aufkleber', zugang: 'admin', handler: async (a) => {
      const r = await dienst.mappenArchiv.archivAufkleber(a.body, ich(a).email);
      return { datei: { inhalt: r.pdf, name: t('meldungen.routen.archivnummern-bis-pdf', { erste: r.erste, letzte: r.letzte }), mime: 'application/pdf', anzeigen: false, groesse: r.pdf.length } };
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.rechtepruefung.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'U');
      // Vorgaben (#1038): Ein Paket löscht keine Dokumente an Vorgaben anderer Pakete.
      await dienst.mappen.pruefeFremdeVorgabe(await zg(a), mappeId);
      const r = await dienst.dokumente.loescheDokument(a.params.id, ich(a).id, { ...liesAnlass({ ...a.query, ...b(a) }), ausloeser: quelle(a), weg: 'dokument' });
      L.dokumente.info(r.papierkorb ? 'Dokument in den Papierkorb gelegt' : 'Dokument gelöscht', { id: a.params.id });
      return leer;
    } },
  ];
}
