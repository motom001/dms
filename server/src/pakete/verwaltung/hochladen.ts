/**
 * Hochladen (#189): einzelne Pakete und Sammeldateien (#461); Vorschau eines Pakets aus Katalog oder Upload.
 */
import { createHash, randomUUID } from 'node:crypto';
import { inMB, type HerkunftPruefung, nachAbhaengigkeiten, vergleicheVersion, type Katalog } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../grundlagen/fehler';
import { SIGNATUR_DATEI } from '../katalogsignatur';
import { t } from '../../sprache/sprache';
import { ARCHIV_MAX, SAMMEL_ENTPACKT_MAX, SAMMEL_MAX } from '../../grundlagen/grenzen';
import { type Paket } from './format';
import { sammelKennungen } from './hilfen';
import { liesPaket } from './lesen';
import { type Handelnder, log } from './optionen';
import { mitPruefung, type Vorschau } from './plan';
import {
  liesSammelVerzeichnis,
  SAMMEL_KATALOG,
  SAMMEL_LIESMICH,
  SAMMEL_PAKETE_MAX,
  SAMMEL_VERZEICHNIS,
  type Sammeldatei,
  type SammelEintrag,
  type SammelPaket,
} from './sammeldatei';
import { liesZip, PAKET_GRENZEN, zipNamen } from './zip-lesen';
import { PaketPlanung } from './planen';

/** Hochladen und Vorschau. */
export abstract class PaketHochladen extends PaketPlanung {
  /**
   * Paket als Datei: dieselbe Prüfung wie bei Katalogpaketen, nur ohne Prüfsumme aus dem Katalog. Steht die
   * Prüfsumme im (schon abgerufenen) offiziellen Katalog, zeigt die Vorschau die Katalogversion (#594).
   */
  async hochladen(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.pakete.bitte-eine-zip-datei'));
    if (daten.length > ARCHIV_MAX)
      throw new Fachfehler(422, t('pakete.groesse.zuGross', { groesse: inMB(daten.length), max: inMB(ARCHIV_MAX) }));
    const paket = liesPaket(liesZip(daten));
    const sha256 = createHash('sha256').update(daten).digest('hex');
    const kv = (await this.offiziell())?.pakete.find((p) => p.id === paket.manifest.id)?.versionen.find((v) => v.sha256 === sha256);
    const pruefung: HerkunftPruefung = { art: 'datei', offiziell: false, ...(kv ? { katalogversion: kv.version } : {}), bestaetigen: true };
    const upload = randomUUID();
    await this.merkeUpload(upload, { paket, von, am: new Date().toISOString(), zeit: Date.now(), pruefung }, daten, 'einzeln');
    log.warn('Paket hochgeladen', {
      von: von.email,
      paket: paket.manifest.id,
      version: paket.manifest.version,
      bytes: daten.length,
      sha256,
      katalog: kv ? `entspricht ${kv.version}` : 'nicht abgeglichen',
    });
    return {
      upload,
      vorschau: mitPruefung(
        await this.plane(
          paket,
          undefined,
          await this.offiziell().catch(() => undefined),
          {},
          {},
          { quelle: { herkunft: { art: 'hochgeladen', von: von.email, am: new Date().toISOString() }, pruefung } },
        ),
        pruefung,
      ),
    };
  }

  /** Hochgeladene Datei (#461): eine Sammeldatei erkennt das DMS an sammeldatei.json, sonst ein einzelnes Paket. */
  async hochladenDatei(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau } | { sammeldatei: Sammeldatei }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.pakete.bitte-eine-zip-datei'));
    if (daten.length > SAMMEL_MAX)
      throw new Fachfehler(422, t('pakete.groesse.sammelZuGross', { groesse: inMB(daten.length), max: inMB(SAMMEL_MAX) }));
    if (zipNamen(daten).includes(SAMMEL_VERZEICHNIS)) return { sammeldatei: await this.sammeldatei(daten, von) };
    return this.hochladen(daten, von);
  }

  /**
   * Sammeldatei prüfen (#461) – alles oder nichts: Verzeichnis, nur erwartete Dateien, je Archiv Größe und
   * SHA-256 wie im Verzeichnis, gegen den signierten Katalog in der Datei (#594) und gegen den offiziellen
   * Katalog, falls er schon abgerufen ist (keine neue Verbindung). Danach jedes Paket mit denselben Prüfungen
   * wie ein einzeln hochgeladenes (liesPaket). Installiert wird nichts; jedes Paket bekommt eine
   * Upload-Kennung und wird einzeln installiert.
   */
  async sammeldatei(daten: Buffer, von: Handelnder): Promise<Sammeldatei> {
    const dateien = liesZip(daten, { dateien: SAMMEL_PAKETE_MAX + 4, entpackt: SAMMEL_MAX });
    const vz = liesSammelVerzeichnis(dateien.get(SAMMEL_VERZEICHNIS));
    const gruende: string[] = [];
    const erwartet = new Set([SAMMEL_VERZEICHNIS, SAMMEL_LIESMICH, SAMMEL_KATALOG, SIGNATUR_DATEI, ...vz.pakete.map((p) => p.archiv)]);
    for (const n of dateien.keys()) if (!erwartet.has(n)) gruende.push(`${n}: steht nicht im Verzeichnis der Sammeldatei.`);
    const katalog = await this.offiziell();
    const signiert = this.eingebettet(dateien);
    const version = (k: Katalog | null | undefined, e: SammelEintrag) =>
      k?.pakete.find((p) => p.id === e.id)?.versionen.find((v) => v.version === e.version);
    const imKatalog = (e: SammelEintrag) => version(katalog, e);
    for (const e of vz.pakete) {
      const a = dateien.get(e.archiv);
      if (!a) {
        gruende.push(t('meldungen.pakete.fehlt-2', { archiv: e.archiv }));
        continue;
      }
      if (a.length !== e.groesse) gruende.push(`${e.name} ${e.version}: Die Größe passt nicht zum Verzeichnis.`);
      else if (createHash('sha256').update(a).digest('hex') !== e.sha256)
        gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum Verzeichnis.`);
      const kv = imKatalog(e);
      if (kv && kv.sha256 !== e.sha256) gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum offiziellen Katalog.`);
      const sv = version(signiert.katalog, e);
      if (sv && sv.sha256 !== e.sha256) gruende.push(t('pakete.herkunft.fehler.sammel', { name: e.name, version: e.version }));
    }
    if (gruende.length) throw new Fachfehler(422, t('meldungen.pakete.die-sammeldatei-ist-beschaedigt'), { gruende });
    const budget = { rest: SAMMEL_ENTPACKT_MAX };
    const gelesen = vz.pakete.map((e) => {
      let paket: Paket;
      try {
        paket = liesPaket(liesZip(dateien.get(e.archiv)!, { ...PAKET_GRENZEN, budget }));
      } catch (x) {
        if (!(x instanceof Fachfehler)) throw x;
        throw new Fachfehler(
          422,
          t('meldungen.pakete.in-der-sammeldatei-es', { name: e.name, version: e.version, message: x.message }),
          x.details,
        );
      }
      if (paket.manifest.id !== e.id || paket.manifest.version !== e.version)
        throw new Fachfehler(
          422,
          t('meldungen.pakete.das-archiv-enthaelt-es', { archiv: e.archiv, id: paket.manifest.id, version: paket.manifest.version }),
        );
      return { e, paket, id: e.id, abhaengigkeiten: paket.manifest.abhaengigkeiten };
    });
    const reihenfolge = nachAbhaengigkeiten(gelesen);
    if (!reihenfolge) throw new Fachfehler(422, t('meldungen.pakete.die-abhaengigkeiten-der-pakete'));
    // Gültig signierter Stand: merken, wenn er neuer ist (ohne Internet wird nichts abgelehnt, nur angezeigt).
    if (signiert.katalog) await this.stand(this.katalogUrl, signiert.katalog, false);
    const am = new Date().toISOString();
    const installierte = await this.d.kern.repo.listePakete();
    const pakete: SammelPaket[] = [];
    const nichtImKatalog: string[] = [];
    for (const { e, paket } of reihenfolge) {
      const upload = randomUUID();
      // Herkunft je Paket: aus dem signierten Katalog nur, wenn es mit genau dieser Prüfsumme darin steht.
      const drin = !!version(signiert.katalog, e);
      if (signiert.katalog && !drin) nichtImKatalog.push(`${paket.manifest.name} ${e.version}`);
      const pruefung: HerkunftPruefung = drin
        ? signiert.pruefung
        : signiert.katalog
          ? { art: 'datei', offiziell: false, bestaetigen: true }
          : signiert.pruefung;
      await this.merkeUpload(upload, { paket, von, am, zeit: Date.now(), pruefung }, dateien.get(e.archiv)!, 'sammel');
      const da = installierte.find((p) => p.id === e.id)?.version ?? null;
      const c = da ? vergleicheVersion(e.version, da) : 1;
      pakete.push({
        upload,
        id: e.id,
        name: paket.manifest.name,
        version: e.version,
        gewaehlt: e.gewaehlt,
        abhaengigkeiten: paket.manifest.abhaengigkeiten,
        ...(paket.manifest.ergaenzt ? { ergaenzt: paket.manifest.ergaenzt } : {}),
        katalog: imKatalog(e) || drin ? 'gleich' : 'unbekannt',
        installiert: da,
        stand: !da ? 'neu' : c > 0 ? 'neuer' : c === 0 ? 'gleich' : 'aelter',
        vorschau: mitPruefung(
          await this.plane(
            paket,
            undefined,
            katalog ?? signiert.katalog ?? undefined,
            {},
            {},
            {
              quelle: { herkunft: { art: 'hochgeladen', von: von.email, am }, pruefung },
              ablauf: true,
              sammel: sammelKennungen(gelesen.map((g) => g.paket)),
            },
          ),
          pruefung,
        ),
      });
    }
    const sha256 = createHash('sha256').update(daten).digest('hex');
    const pruefung: HerkunftPruefung = { ...signiert.pruefung, bestaetigen: pakete.some((p) => p.vorschau.pruefung?.bestaetigen) };
    log.warn('Sammeldatei hochgeladen', {
      von: von.email,
      sha256,
      bytes: daten.length,
      pakete: pakete.map((p) => `${p.id}@${p.version}`).join(', '),
      katalog: pakete.every((p) => p.katalog === 'gleich') ? 'abgeglichen' : 'nicht abgeglichen',
      signatur: signiert.katalog
        ? `offizieller Katalog vom ${signiert.katalog.erstellt}${nichtImKatalog.length ? `, nicht darin: ${nichtImKatalog.join(', ')}` : ''}`
        : signiert.pruefung.art,
    });
    return {
      datei: {
        sha256,
        groesse: daten.length,
        erstellt: vz.erstellt,
        quelle: vz.quelle,
        katalog: vz.katalog,
        dms: vz.dms,
        pruefung,
        nichtImKatalog,
      },
      pakete,
    };
  }

  /** Vorschau: was angelegt bzw. ergänzt wird, Namenskonflikte, Version und Abhängigkeiten, Herkunft (#594). */
  async vorschau(e: { id?: string; version?: string; quelle?: string; upload?: string }): Promise<Vorschau> {
    if (e.upload) {
      const u = await this.hochgeladen(e.upload);
      return mitPruefung(
        await this.plane(
          u.paket,
          undefined,
          await this.offiziell(),
          {},
          {},
          { quelle: { herkunft: { art: 'hochgeladen', von: u.von.email, am: u.am }, pruefung: u.pruefung } },
        ),
        u.pruefung,
      );
    }
    const { paket, v, katalog, pruefung, url } = await this.lade(
      String(e.id),
      e.version ? String(e.version) : undefined,
      e.quelle ? String(e.quelle) : undefined,
      true,
    );
    return mitPruefung(await this.plane(paket, v, katalog, {}, {}, { quelle: { herkunft: { art: 'katalog', url }, pruefung } }), pruefung);
  }
}
