/**
 * Paket selbst erstellen (#374): gewählte Mappentypen und Ansichten dieses DMS als .zip im Format der
 * Registry (manifest.yaml, inhalt/…, README, CHANGELOG, LICENSE, tests/erwartung.yaml).
 *
 * - Nur, was das Paketformat heute kann; was nicht hineinpasst, steht als Hinweis in der Prüfung.
 * - Typen und Ansichten aus installierten Paketen werden nicht kopiert, sondern Abhängigkeit (>= installierte Version).
 * - Verweise auf Benutzer und Rolle werden dms:…, auf den Ablageort basis:ablageort (#883, Abhängigkeit Basis); auf eigene,
 *   nicht gewählte Typen: „mit aufnehmen“.
 * - Ansichten dürfen ohne ihre Mappentypen ins Paket (#656): Der Typ bleibt über seine Kennung erhalten (`fremde_typen`),
 *   die Prüfung warnt nur.
 * - Keine Mappendaten außer ausdrücklich gewählten Beispiel-Mappen; nie Passwörter, nie Benutzer, keine Ids.
 * - Vor dem Download dieselbe Prüfung wie beim Hochladen (liesPaket).
 *
 * `baue` ist eine reine Funktion (testbar ohne DMS); die Klasse holt den Stand aus dem Dienst.
 */
import { buffer as alsPuffer } from 'node:stream/consumers';
import { parse } from 'yaml';
import { werkbankAus, WERKBANK_EINSTELLUNG } from '../../entdecken/entdecken-werkbank';
import type { Automatisierung } from '../../../../shared/src/automatisierung';
import { inMB, vergleicheVersion, type InstalliertesPaket } from '../../../../shared/src/pakete';
import {
  LIZENZ_VORGABE,
  naechsteVersion,
  type ErstellenStand,
  type PaketEntwurf,
  type PaketErstellenEingabe,
  type PaketPruefung,
  type SelbstErstellt,
  type SelbstErstelltDetail,
} from '../../../../shared/src/paketerstellung';
import type { Dienst } from '../../dienst/dienst';
import { t } from '../../sprache/sprache';
import { Fachfehler } from '../../grundlagen/fehler';
import { ARCHIV_MAX, liesZip } from '../verwaltung/zip-lesen';
import { beispielDateiart } from '../verwaltung/beispiele';
import { liesPaket } from '../verwaltung/lesen';
import { type Handelnder } from '../verwaltung/optionen';
import { protokoll } from '../../protokoll/protokoll';
import { zipPuffer } from '../../formate/zip';
import { ARCHIV_MERKEN_MAX } from '../../grundlagen/grenzen';
import { paketArchive, paketEntwuerfe, setzePaketArchive, setzePaketEntwuerfe } from '../index';
import {
  aenderung,
  aenderungsText,
  ARCHIVE_JE_PAKET,
  type Bau,
  BEISPIELMAPPEN_MAX,
  ENTWUERFE_MAX,
  type ErstellenDaten,
  type GemerktesArchiv,
  liesEingabe,
} from './bau-hilfen';
import { baue } from './baue';
import { baueTypenDatei } from './typen-datei';
import { spieleTypenEin, typenVorschau } from './typen-austausch';
import {
  TYPEN_DATEI_TYPEN_MAX,
  type TypenExport,
  type TypenImportErgebnis,
  type TypenImportVorschau,
} from '../../../../shared/src/typendatei';

/** Inhalt der Datei aus der Anfrage (`inhalt`, Text). */
const typenText = (e: unknown): string => {
  const inhalt = (e as { inhalt?: unknown } | null)?.inhalt;
  if (typeof inhalt !== 'string' || !inhalt) throw new Fachfehler(422, t('meldungen.paketerstellung.typen-datei-json'));
  return inhalt;
};

const log = protokoll.modul('werkbank');

/** Paket erstellen im DMS: Stand, Prüfung, Export; gemerkt werden die Angaben (Einstellung). */
export class Paketerstellung {
  /** automatisierungen (#680): eigene Automatisierungen zum Mitnehmen; fehlt, wenn es keine gibt (Tests). */
  constructor(
    private d: Dienst,
    private o: { version: () => string; automatisierungen?: () => Promise<Array<Automatisierung & { kurz?: string }>> },
  ) {}

  private async eigeneAutomatisierungen() {
    return ((await this.o.automatisierungen?.().catch(() => [])) ?? []).filter((a) => a.herkunft === 'eigen');
  }

  private async dmsTypen(): Promise<Map<string, string>> {
    const s = await this.d.kern.system();
    // Den Ablageort von Basis behandelt die Erstellung wie jeden Paket-Typ; den früheren des Kerns gibt es nur noch hier (#883).
    const a = await this.d.kern.frueherAblageortTyp();
    return new Map<string, string>([
      [s.benutzer.id, 'benutzer'],
      [s.rolle.id, 'rolle'],
      ...(a ? [[a.id, 'ablageort'] as [string, string]] : []),
    ]);
  }

  /* ---------- Mappentypen als Datei (#1315) ---------- */

  /** Export: Vorschau (was die Datei enthält, Abhängigkeiten, Hinweise) und – ohne Probleme – die Datei selbst. */
  async typenExport(e: unknown): Promise<TypenExport> {
    const roh = (e ?? {}) as { typen?: unknown };
    const ids = Array.isArray(roh.typen) ? [...new Set(roh.typen.map(String))].slice(0, TYPEN_DATEI_TYPEN_MAX) : [];
    const leer = { typen: ids, sichten: [], beispiele: [], wortlisten: [], id: '' } as unknown as PaketErstellenEingabe;
    return baueTypenDatei(ids, await this.daten(leer));
  }

  /** Import, Vorschau: neu, vorhanden (gleiche Kennung) und was sich ändern würde. Ändert nichts. */
  async typenVorschau(e: unknown): Promise<TypenImportVorschau> {
    return typenVorschau(this.d, typenText(e), await this.dmsTypen());
  }

  /** Import nach Bestätigung derselben Datei (Prüfsumme aus der Vorschau). */
  async typenEinspielen(e: unknown, von: string): Promise<TypenImportErgebnis> {
    const sha = (e as { sha256?: unknown } | null)?.sha256;
    return spieleTypenEin(this.d, typenText(e), typeof sha === 'string' ? sha : '', von, await this.dmsTypen());
  }

  /** Was es zur Auswahl gibt, gemerkte Entwürfe und Vorschläge für den nächsten Export. */
  async stand(): Promise<ErstellenStand> {
    const [typen, sichten, pakete, dmsTypen, entwuerfe] = [
      await this.d.mappentypen.listeTypen(),
      await this.d.sichtenVerwaltung.listeSichten(),
      await this.d.kern.repo.listePakete(),
      await this.dmsTypen(),
      await paketEntwuerfe(this.d.kern),
    ];
    const herkunft = (map: (p: InstalliertesPaket) => Record<string, string>, id: string) => {
      const p = pakete.find((x) => Object.values(map(x)).includes(id));
      return p ? { id: p.id, name: p.name, version: p.version } : null;
    };
    // Nötige Ablago-Version bleibt leer: Die Oberfläche setzt die ermittelte Mindestversion aus der Prüfung (#651).
    const leer: PaketErstellenEingabe = {
      typen: [],
      sichten: [],
      beispiele: [],
      wortlisten: [],
      id: '',
      name: '',
      version: '1.0.0',
      beschreibung: '',
      autor: { name: '', github: '' },
      lizenz: LIZENZ_VORGABE,
      lizenzArt: 'frei',
      dms: '',
      aenderungen: '',
    };
    return {
      typen: typen
        .filter((t) => !t.system && !dmsTypen.has(t.id))
        .map((t) => {
          const p = pakete.find((x) => Object.values(x.typen).includes(t.id));
          const a = p ? aenderung(t, p, (id) => typen.find((x) => x.id === id)?.schluessel) : { geaendert: false, unterschiede: null };
          return {
            id: t.id,
            name: t.name,
            beschreibung: t.beschreibung ?? '',
            paket: herkunft((x) => x.typen, t.id),
            geaendert: a.geaendert,
            ...(a.geaendert ? { unterschiede: a.unterschiede } : {}),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
      sichten: sichten.map((s) => ({ id: s.id, name: s.name, elternId: s.elternId ?? null, paket: herkunft((x) => x.sichten, s.id) })),
      wortlisten: (await this.d.suche.sucheStand()).synonyme.map((g) => ({
        id: g.id,
        woerter: g.woerter,
        paket: g.quelle === 'werkbank' ? null : { id: g.quelle, name: g.paketName ?? g.quelle },
      })),
      rundgaenge: (await this.eigeneRundgaenge()).map((x) => ({
        schluessel: x.schluessel,
        titel: typeof x.roh.titel === 'string' ? x.roh.titel : x.schluessel,
      })),
      tipps: werkbankAus(await this.d.kern.einstellungen?.lies(WERKBANK_EINSTELLUNG)).tipps.map((x) => ({
        schluessel: x.schluessel,
        text: x.daten.text,
      })),
      automatisierungen: (await this.eigeneAutomatisierungen()).map((a) => ({ id: a.id, name: a.name, kurz: a.kurz ?? '' })),
      entwuerfe,
      dms: this.o.version(),
      // #652: nie ungefragt vorbelegen – „Neue Version von …“ wählt man im ersten Schritt.
      vorschlag: leer,
    };
  }

  /** Angaben eines gemerkten Entwurfs mit höherer Version und aktueller DMS-Version. */
  ausEntwurf(e: PaketEntwurf): PaketErstellenEingabe {
    return {
      typen: e.typen,
      sichten: e.sichten,
      beispiele: e.beispiele,
      wortlisten: e.wortlisten ?? [],
      ...(e.rundgaenge?.length ? { rundgaenge: e.rundgaenge } : {}),
      ...(e.tipps?.length ? { tipps: e.tipps } : {}),
      ...(e.automatisierungen?.length ? { automatisierungen: e.automatisierungen } : {}),
      ...(e.beispielDokumente ? { beispielDokumente: true } : {}),
      id: e.id,
      name: e.name,
      version: naechsteVersion(e.version),
      beschreibung: e.beschreibung,
      autor: e.autor,
      lizenz: e.lizenz,
      lizenzArt: e.lizenzArt ?? 'frei',
      ...(e.lizenzName ? { lizenzName: e.lizenzName } : {}),
      ...(e.lizenzText ? { lizenzText: e.lizenzText } : {}),
      dms: '',
      aenderungen: '',
    };
  }

  private async daten(e: PaketErstellenEingabe): Promise<ErstellenDaten> {
    const typen = await this.d.mappentypen.listeTypen();
    const gewaehlt = new Set(e.beispiele);
    const mappen = gewaehlt.size
      ? (await Promise.all(e.typen.filter((t) => typen.some((x) => x.id === t)).map((t) => this.d.mappen.listeMappen(t))))
          .flat()
          .filter((m) => gewaehlt.has(m.id))
      : [];
    // Beispiel-Dokumente (#878): nur PDF, PNG und JPEG; zusammen höchstens so viel, wie ins Archiv passt.
    const dokumente = new Map<string, Array<{ name: string; registerKey: string; erstellt: string; inhalt: Buffer }>>();
    let ausgelassen = 0,
      summe = 0;
    if (e.beispielDokumente) {
      for (const m of mappen) {
        for (const x of await this.d.listeDokumente(m.id)) {
          if (!['application/pdf', 'image/png', 'image/jpeg'].includes(x.mime)) {
            ausgelassen++;
            continue;
          }
          summe += x.groesse;
          if (summe > ARCHIV_MAX) continue;
          const roh = (await this.d.dokumente.dokumentInhalt(x.id)).inhalt;
          const inhalt = Buffer.isBuffer(roh) ? roh : await alsPuffer(roh);
          if (!beispielDateiart(x.mime === 'application/pdf' ? 'a.pdf' : x.mime === 'image/png' ? 'a.png' : 'a.jpg', inhalt)) {
            ausgelassen++;
            continue;
          }
          dokumente.set(m.id, [...(dokumente.get(m.id) ?? []), { name: x.name, registerKey: x.registerKey, erstellt: x.erstellt, inhalt }]);
        }
      }
    }
    // Vorgaben (#1038), auf die Anzeige-Bedingungen „zeigt auf“ zeigen: Id → feste Kennung.
    const gezeigt = [
      ...new Set(
        typen
          .flatMap((x) => [...x.felder.map((f) => f.anzeigen), ...x.register.flatMap((r) => (r.abschnitte ?? []).map((a) => a.anzeigen))])
          .flatMap((r) => r?.bedingungen ?? [])
          .flatMap((b) =>
            b.art === 'feld' && b.bedingung.op === 'zeigtAuf' && b.bedingung.wert?.art === 'fest' && Array.isArray(b.bedingung.wert.wert)
              ? b.bedingung.wert.wert.map(String)
              : [],
          ),
      ),
    ];
    const vorgaben = new Map(
      (gezeigt.length ? await this.d.kern.repo.holeMappen(gezeigt) : []).filter((m) => m.vorgabe).map((m) => [m.id, m.vorgabe!] as const),
    );
    return {
      dokumente,
      dokumenteAusgelassen: ausgelassen,
      ...(summe > ARCHIV_MAX ? { dokumenteZuGross: summe } : {}),
      vorgaben,
      typen,
      sichten: await this.d.sichtenVerwaltung.listeSichten(),
      pakete: await this.d.kern.repo.listePakete(),
      dmsTypen: await this.dmsTypen(),
      mappen,
      wortlisten: (await this.d.suche.sucheStand()).synonyme,
      rundgaenge: await this.eigeneRundgaenge(),
      tipps: werkbankAus(await this.d.kern.einstellungen?.lies(WERKBANK_EINSTELLUNG)).tipps,
      automatisierungen: await this.eigeneAutomatisierungen(),
      dmsVersion: this.o.version(),
      entwurf: (await paketEntwuerfe(this.d.kern)).find((x) => x.id === e.id.trim()) ?? null,
      entwuerfe: await paketEntwuerfe(this.d.kern),
      jetzt: new Date(),
    };
  }

  /** Eigene Rundgänge der Werkbank (#941), gelesen (Dateien, die sich nicht lesen lassen, fehlen). */
  private async eigeneRundgaenge(): Promise<Array<{ schluessel: string; roh: Record<string, unknown> }>> {
    const w = werkbankAus(await this.d.kern.einstellungen?.lies(WERKBANK_EINSTELLUNG));
    return w.rundgaenge.flatMap((r) => {
      try {
        const x = parse(r.yaml) as unknown;
        const roh = Array.isArray(x) ? x[0] : x;
        return roh && typeof roh === 'object' ? [{ schluessel: r.schluessel, roh: roh as Record<string, unknown> }] : [];
      } catch {
        return [];
      }
    });
  }

  /** Baut das Paket und prüft das Archiv wie beim Hochladen. */
  private async baueUndPruefe(e: PaketErstellenEingabe): Promise<{ bau: Bau; zip: Buffer | null; daten: ErstellenDaten }> {
    const daten = await this.daten(e);
    const bau = baue(e, daten);
    if (bau.probleme.length) return { bau, zip: null, daten };
    const id = e.id.trim();
    const zip = zipPuffer(
      bau.dateien.map((f) => ({ name: `${id}/${f.name}`, daten: f.daten })),
      daten.jetzt,
    );
    if (zip.length > ARCHIV_MAX) {
      bau.probleme.push(t('pakete.groesse.erstellenZuGross', { groesse: inMB(zip.length), max: inMB(ARCHIV_MAX) }));
      return { bau, zip: null, daten };
    }
    try {
      const p = liesPaket(liesZip(zip));
      if (p.manifest.id !== id || p.typen.length !== bau.inhalt.typen.length || p.sichten.length !== bau.inhalt.sichten.length)
        throw new Error('Inhalt weicht ab.');
    } catch (x) {
      const g = (x as Fachfehler).details as { gruende?: string[] } | undefined;
      bau.probleme.push(
        t('meldungen.paketerstellung.die-pruefung-wie-beim', {
          message: (x as Error).message,
          wert: g?.gruende ? ` ${g.gruende.join(' ')}` : '',
        }),
      );
      return { bau, zip: null, daten };
    }
    return { bau, zip, daten };
  }

  /** Automatische Prüfung mit Hinweisen und den Mappen, aus denen Beispiele gewählt werden können. */
  async pruefe(eingabe: unknown): Promise<PaketPruefung> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    const eigene = daten.typen.filter(
      (t) =>
        e.typen.includes(t.id) &&
        !t.system &&
        !daten.dmsTypen.has(t.id) &&
        !daten.pakete.some((p) => Object.values(p.typen).includes(t.id)),
    );
    const beispielMappen = await Promise.all(
      eigene.map(async (mappentyp) => {
        const alle = (await this.d.mappen.listeMappen(mappentyp.id))
          .filter((m) => !m.systemKennung)
          .sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
        return {
          typId: mappentyp.id,
          typ: mappentyp.name,
          mappen: alle
            .slice(0, BEISPIELMAPPEN_MAX)
            .map((m) => ({ id: m.id, titel: m.titel || t('meldungen.paketerstellung.ohne-titel'), demo: !!m.demo })),
          mehr: alle.length > BEISPIELMAPPEN_MAX,
        };
      }),
    );
    return {
      probleme: bau.probleme,
      fehlend: bau.fehlend.map(({ noetig: _n, ...f }) => f),
      hinweise: bau.hinweise,
      abhaengigkeiten: bau.abhaengigkeiten,
      inhalt: bau.inhalt,
      beispielMappen,
      einspielbar: !!zip,
      datei: zip ? { name: `${e.id.trim()}-${e.version.trim()}.zip`, bytes: zip.length } : null,
      version: bau.version,
    };
  }

  /**
   * „Letzte Version des Pakets hochladen“ (#651): Ablago kennt die zuletzt weitergegebene Version nicht
   * (z. B. auf einem anderen Gerät erstellt). Liest nur Id, Name und Version aus dem Archiv; installiert nichts.
   */
  liesLetzteVersion(daten: unknown): { id: string; name: string; version: string } {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.paketerstellung.bitte-die-zip-datei'));
    if (daten.length > ARCHIV_MAX)
      throw new Fachfehler(422, t('pakete.groesse.erstellenZuGross', { groesse: inMB(daten.length), max: inMB(ARCHIV_MAX) }));
    const m = liesPaket(liesZip(daten)).manifest;
    return { id: m.id, name: m.name, version: m.version };
  }

  private async archive(id: string): Promise<GemerktesArchiv[]> {
    const v = await paketArchive(this.d.kern, id);
    return Array.isArray(v) ? v.filter((x): x is GemerktesArchiv => !!x && typeof x.version === 'string' && typeof x.zip === 'string') : [];
  }

  /** Selbst erstellte Pakete für die Paketverwaltung (#652), zuletzt erstellte zuerst. */
  async selbstErstellt(): Promise<SelbstErstellt[]> {
    const liste = [...(await paketEntwuerfe(this.d.kern))].sort((a, b) => b.exportiert.localeCompare(a.exportiert));
    return Promise.all(liste.map(async (e) => this.kurz(e, await this.archive(e.id))));
  }

  private kurz(e: PaketEntwurf, archive: GemerktesArchiv[]): SelbstErstellt {
    return {
      id: e.id,
      name: e.name,
      version: e.version,
      erstellt: e.exportiert,
      von: e.von,
      lizenz: e.lizenz,
      versionen: archive.map((a) => ({ version: a.version, erstellt: a.erstellt, bytes: Math.floor((a.zip.length * 3) / 4) })),
    };
  }

  /** Was damals erstellt wurde und was sich seitdem geändert hat (#652). */
  async selbstErstelltDetail(id: string): Promise<SelbstErstelltDetail> {
    const e = (await paketEntwuerfe(this.d.kern)).find((x) => x.id === id);
    if (!e) throw new Fachfehler(404, t('meldungen.paketerstellung.dieses-selbst-erstellte-paket'));
    const [typen, sichten] = [await this.d.mappentypen.listeTypen(), await this.d.sichtenVerwaltung.listeSichten()];
    return {
      ...this.kurz(e, await this.archive(id)),
      beschreibung: e.beschreibung,
      dms: e.dms,
      autor: e.autor,
      aenderungen: e.aenderungen,
      verlauf: e.verlauf,
      typen: e.typen.map((tid) => {
        const t = typen.find((x) => x.id === tid);
        return { id: tid, name: t?.name ?? null, geaendert: !!t && t.geaendert > e.exportiert };
      }),
      sichten: e.sichten.map((sid) => ({ id: sid, name: sichten.find((x) => x.id === sid)?.name ?? null })),
      beispiele: e.beispiele.length,
    };
  }

  /** Eine erstellte Version noch einmal als ZIP (#652) – genau so, wie sie erstellt wurde. */
  async archiv(id: string, version: string): Promise<{ name: string; daten: Buffer }> {
    const a = (await this.archive(id)).find((x) => x.version === version);
    if (!a) throw new Fachfehler(404, t('meldungen.paketerstellung.version-von-ist-nicht', { version, id }));
    return { name: `${id}-${version}.zip`, daten: Buffer.from(a.zip, 'base64') };
  }

  /** „Aus der Liste nehmen“ (#652): vergisst Entwurf und gemerkte Archive – Mappentypen und Ansichten bleiben. */
  async ausListeNehmen(id: string, von: Handelnder): Promise<SelbstErstellt[]> {
    const alle = await paketEntwuerfe(this.d.kern);
    if (!alle.some((x) => x.id === id)) throw new Fachfehler(404, t('meldungen.paketerstellung.dieses-selbst-erstellte-paket'));
    await setzePaketEntwuerfe(
      this.d.kern,
      alle.filter((x) => x.id !== id),
    );
    await setzePaketArchive(this.d.kern, id, null);
    log.info('Selbst erstelltes Paket aus der Liste genommen', { von: von.email, paket: id });
    return this.selbstErstellt();
  }

  /**
   * „Paket erstellen“ (#652): erstellt das Paket – es erscheint unter „Installiert“ als selbst erstellt –,
   * merkt die Angaben für die nächste Version und das Archiv zum späteren Herunterladen.
   */
  async erstelle(eingabe: unknown, von: Handelnder): Promise<SelbstErstellt & { name: string; datei: string; bytes: number }> {
    const r = await this.exportiere(eingabe, von);
    const e = (await paketEntwuerfe(this.d.kern)).find((x) => r.name.startsWith(`${x.id}-`))!;
    return { ...this.kurz(e, await this.archive(e.id)), datei: r.name, bytes: r.daten.length };
  }

  /** Export als .zip: nur, wenn die Prüfung bestanden ist; merkt die Angaben für den nächsten Export. */
  async exportiere(eingabe: unknown, von: Handelnder): Promise<{ name: string; daten: Buffer }> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    if (!zip) throw new Fachfehler(422, t('meldungen.paketerstellung.das-paket-laesst-sich'), { gruende: bau.probleme });
    const id = e.id.trim();
    const entwurf: PaketEntwurf = {
      ...e,
      id,
      version: e.version.trim(),
      aenderungen: aenderungsText(e, daten.entwurf),
      felder: { ...(daten.entwurf?.felder ?? {}), ...bau.felder },
      schluessel: { ...(daten.entwurf?.schluessel ?? {}), ...bau.schluessel },
      verlauf: daten.entwurf
        ? [
            {
              version: daten.entwurf.version,
              datum: daten.entwurf.exportiert.slice(0, 10),
              text: daten.entwurf.aenderungen || t('meldungen.paketerstellung.aus-ablago-exportiert'),
            },
            ...daten.entwurf.verlauf,
          ]
            .filter((v) => vergleicheVersion(v.version, e.version.trim()) < 0)
            .slice(0, 50)
        : [],
      exportiert: daten.jetzt.toISOString(),
      von: von.email,
    };
    const rest = (await paketEntwuerfe(this.d.kern)).filter((x) => x.id !== id);
    await setzePaketEntwuerfe(this.d.kern, [entwurf, ...rest].slice(0, ENTWUERFE_MAX));
    // Archiv merken (#652), damit „Als ZIP herunterladen“ später genau diese Version liefert.
    if (zip.length <= ARCHIV_MERKEN_MAX) {
      const alt = (await this.archive(id)).filter((a) => a.version !== entwurf.version);
      await setzePaketArchive(
        this.d.kern,
        id,
        [{ version: entwurf.version, erstellt: entwurf.exportiert, zip: zip.toString('base64') }, ...alt].slice(0, ARCHIVE_JE_PAKET),
      );
    }
    for (const weg of rest.length + 1 > ENTWUERFE_MAX ? rest.slice(ENTWUERFE_MAX - 1) : [])
      await setzePaketArchive(this.d.kern, weg.id, null);
    log.info('Paket erstellt', {
      von: von.email,
      paket: id,
      version: entwurf.version,
      typen: bau.inhalt.typen.length,
      sichten: bau.inhalt.sichten.length,
      beispiele: bau.inhalt.beispiele,
      abhaengigkeiten: Object.keys(bau.abhaengigkeiten),
    });
    return { name: `${id}-${entwurf.version}.zip`, daten: zip };
  }
}
