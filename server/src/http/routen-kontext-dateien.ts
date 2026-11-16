/**
 * Dateien im Routen-Kontext (#1278, Schritt 6b-1: aus `routenKontext` verschoben, unverändert): Weitergeben,
 * Herunterladen mit Recht E, Abrufe in der Historie, Seitenbilder, Anzeige im Browser, ausgegebene Dateien und
 * Passwörter in Antworten.
 */
import type { Readable } from 'node:stream';
import { buffer as alsPuffer } from 'node:stream/consumers';
import { pdfFuerAnzeige } from '../dateien/pdfanzeige';
import type { Abruffassung } from '../../../shared/src/model';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';
import { wunschAus } from '../../../shared/src/stempel';
import { t } from '../sprache/sprache';
import { L, ich } from './routen-hilfen';
import type { Anfrage, Datei, Antwort } from './routen-typen';
import type { rechteHilfen, zugangHilfen } from './routen-kontext-rechte';

/** Hilfen beim Abruf von Dateien: Weitergabe, Mitnehmen, Abruf in der Historie, Seitenbilder, Passwörter. */
export function abrufHilfen(
  dienst: Dienst,
  zg: ReturnType<typeof rechteHilfen>['zg'],
  modusSpur: ReturnType<typeof zugangHilfen>['modusSpur'],
) {
  /**
   * Ist ein Abruf ein Weitergeben (#394)? Herunterladen (?herunterladen), Stempel-Parameter oder ein API-Schlüssel
   * eines Benutzers. Anzeigen in der Oberfläche und Pakete (Dienstkonten, z. B. Texterkennung) bekommen das Original.
   */
  const weitergabe = (a: Anfrage) =>
    a.query.herunterladen !== undefined ||
    a.query.verkleinern !== undefined ||
    !!wunschAus(a.query) ||
    (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /**
   * Herunterladen ist Mitnehmen (#723): verlangt außer Lesen das Exportrecht E – über die gemeinsame Prüfstelle wie
   * E-Mail, Export und Laufwerk. Anzeigen im Browser (inline) bleibt mit R. Dienstkonten der Pakete (Texterkennung,
   * Umwandlung, Archivfassung) lesen Dateien zur Verarbeitung in Ablago und brauchen E nicht.
   */
  const mitnehmen = async (a: Anfrage, mappeId: string) => {
    if (a.benutzer?.art === 'dienst') return;
    await dienst.ausgang.pruefeAusgang(ich(a), await zg(a), 'herunterladen', [mappeId]);
    await modusSpur(a, [mappeId], 'heruntergeladen');
  };
  /**
   * Abruf in die Historie (#800): in der Oberfläche heruntergeladen oder mit einem API-Schlüssel abgerufen – erst wenn
   * die Datei fertig zum Ausliefern ist (Rechte geprüft, Stempel und Fassung gebildet), nie bei einem Fehler. Pakete
   * (Dienstkonten) lesen Dateien zur Verarbeitung in Ablago; das ist kein Abruf. Gleiche Abrufe am selben Tag fasst
   * `notiereAbruf` zu einem Eintrag zusammen. Scheitert das Schreiben, geht die Datei nicht hinaus. `anlagen` (#998):
   * Dokumente, die in derselben Datei mit hinausgehen (ZIP „mit Anlagen“) – je eines ein eigener Abruf mit demselben
   * Weg und API-Schlüssel, damit der Nachweis auch für die Anlagen zeigt, worüber sie hinausgingen.
   */
  const abgerufen = async <T extends Antwort>(
    a: Anfrage,
    dokumentId: string,
    o: { fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; datei?: string },
    antwort: T,
    anlagen: ReadonlyArray<{ dokumentId: string; gestempelt?: boolean; datei?: string }> = [],
  ): Promise<T> => {
    if (a.benutzer?.art === 'dienst') return antwort;
    const wie = {
      benutzerId: ich(a).id,
      weg: a.apiSchluessel ? ('api' as const) : ('oberflaeche' as const),
      schluessel: a.apiSchluessel?.name ?? null,
    };
    try {
      await dienst.mappenHistorie.notiereAbruf({ dokumentId, ...wie, ...o });
      for (const x of anlagen) await dienst.mappenHistorie.notiereAbruf({ ...wie, ...o, ...x });
    } catch (e) {
      const inhalt = antwort.datei?.inhalt;
      if (inhalt && !Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
      throw e;
    }
    return antwort;
  };
  /** Abruf mit dem API-Schlüssel eines Menschen (nicht eines Pakets): gilt als Herausgeben (#394, #799). */
  const herausgeben = (a: Anfrage) => !!a.apiSchluessel && a.benutzer?.art !== 'dienst';
  /**
   * Seitenbilder über einen API-Schlüssel (#799): Recht E und – wenn ein Stempel gilt – Bilder aus der gestempelten
   * Kopie. Oberfläche und Pakete bekommen die Seiten, wie sie abgelegt sind (null).
   */
  const seitenquelle = async (a: Anfrage, mappeId: string) => {
    if (!herausgeben(a)) return null;
    await mitnehmen(a, mappeId);
    return dienst.ausgang.gestempelteSeiten(a.params.id, { stempel: a.query, ich: ich(a) });
  };
  /** Kommt die Datei nicht zum Ansehen (inline), sondern zum Abspeichern? Mit API-Schlüssel eines Menschen immer. */
  const zumAbspeichern = (a: Anfrage) => a.query.herunterladen !== undefined || (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /** Passwörter für Dokumente (#827): nur die Person selbst im Browser – kein API-Schlüssel, keine Vertretung. */
  const nurSelbst = (a: Anfrage) => {
    if (a.apiSchluessel || !a.sitzungsDaten?.id) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    if (a.sitzungsDaten.vertretungId) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.vertretung'));
    const e = dienst.geschuetztePdfs.pdfEntsperren;
    if (!e) throw new Fachfehler(404, t('mappen.entsperren.gemerkt.aus'));
    return e;
  };
  return { weitergabe, mitnehmen, abgerufen, herausgeben, seitenquelle, zumAbspeichern, nurSelbst };
}

/**
 * Anzeige im Browser (#639): Ein PDF kommt nur als bereinigte Kopie in den eingebauten Betrachter (ohne JavaScript,
 * automatische Aktionen, Formular-Übermittlung, eingebettete Dateien). Mit API-Schlüssel (Pakete) das Original.
 * Lässt es sich nicht bereinigen, gibt es statt der Anzeige einen kurzen Hinweis – Herunterladen geht weiter.
 */
export const fuerAnzeige = async (a: Anfrage, d: Datei): Promise<Antwort> => {
  if (!d.anzeigen || d.mime !== 'application/pdf' || a.apiSchluessel) return { datei: d };
  const pdf = await pdfFuerAnzeige(Buffer.isBuffer(d.inhalt) ? d.inhalt : await alsPuffer(d.inhalt));
  if (!pdf) {
    const hinweis = Buffer.from(
      'Dieses PDF lässt sich nicht sicher anzeigen (verschlüsselt oder beschädigt). Bitte lade es herunter und öffne es in einem PDF-Programm.\n\nThis PDF cannot be displayed safely (encrypted or damaged). Please download it and open it in a PDF reader.\n',
    );
    return {
      datei: {
        inhalt: hinweis,
        name: 'hinweis.txt',
        mime: 'text/plain; charset=utf-8',
        anzeigen: true,
        groesse: hinweis.length,
        koepfe: { 'x-dms-anzeige': 'nur-herunterladen', 'cache-control': 'no-store' },
      },
    };
  }
  return { datei: { ...d, inhalt: pdf, groesse: pdf.length, koepfe: { ...d.koepfe, 'x-dms-anzeige': 'bereinigt' } } };
};

/** Antwort für eine ausgegebene Datei (#394): immer als Herunterladen. Verkleinert (#393): Kopf X-DMS-Verkleinert „vorher/nachher“. */
export const ausgabeDatei = (r: {
  name: string;
  mime: string;
  anzeigbar: boolean;
  groesse: number;
  inhalt: Buffer | Readable;
  gestempelt: boolean;
  verkleinert?: { vorher: number; nachher: number } | null;
}): Antwort => {
  L.dokumente.debug(r.gestempelt ? 'Dokument mit Stempel heruntergeladen' : 'Dokument heruntergeladen', { name: r.name });
  const koepfe: Record<string, string> = {
    ...(r.gestempelt ? { 'x-dms-stempel': '1' } : {}),
    ...(r.verkleinert ? { 'x-dms-verkleinert': `${r.verkleinert.vorher}/${r.verkleinert.nachher}` } : {}),
  };
  return {
    datei: {
      inhalt: r.inhalt,
      name: r.name,
      mime: r.anzeigbar ? r.mime : 'application/octet-stream',
      anzeigen: false,
      groesse: r.groesse,
      ...(Object.keys(koepfe).length ? { koepfe } : {}),
    },
  };
};

/**
 * ?passwoerter=anzeigen (#46): nur mit einem API-Schlüssel, der das Recht „Passwörter lesen“ hat.
 * Liefert den Namen des Schlüssels fürs Protokoll, sonst null.
 */
export const passwoerterAnzeigen = (a: Anfrage): string | null => {
  if (a.query.passwoerter === undefined) return null;
  if (a.query.passwoerter !== 'anzeigen') throw new Fachfehler(422, t('meldungen.routen.passwoerter-kennt-nur-den'));
  if (!a.apiSchluessel?.passwoerter) throw new Fachfehler(403, t('meldungen.routen.passwoerter-liefert-die-api'));
  return a.apiSchluessel.name;
};
