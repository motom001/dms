/**
 * Kataloge und Quellen (#188, #189): abrufen, Signatur und Stand prüfen (pruefeKatalog, pruefeOffiziell, stand),
 * offizieller Katalog, installierte Pakete, Paket laden und Updates. Quellen hinzufügen und ihren Schlüssel bestätigen
 * steht in paketverwaltung.ts (Fingerabdruck).
 */
import { createHash } from 'node:crypto';
import {
  fehlendeTeile,
  inMB,
  type HerkunftPruefung,
  istKiPaket,
  liesKatalog,
  vergleicheVersion,
  type InstalliertesPaket,
  type Katalog,
  type KatalogPaket,
  type KatalogVersion,
  katalogPaketZu,
} from '../../../../shared/src/pakete';
import { fehlendePflicht } from '../../../../shared/src/paketeinstellungen';
import type { PaketQuelleEintrag } from '../index';
import { Fachfehler } from '../../grundlagen/fehler';
import {
  liesSchluessel,
  nurTestschluessel,
  projektSchluessel,
  pruefeSignatur,
  SCHLUESSEL_DATEI,
  SIGNATUR_DATEI,
  SIGNATUR_MAX,
  WECHSEL_DATEI,
  zeitVon,
  type Schluessel,
} from '../katalogsignatur';
import { t } from '../../sprache/sprache';
import { ARCHIV_MAX, KLEIN_MAX } from '../../grundlagen/grenzen';
import { paketEinstellungen, paketKatalogStaende, paketQuellen, setzePaketKatalogStand, setzePaketQuellen } from '../index';
import { daneben, holeDaten } from './abruf';
import { type Paket } from './format';
import { zeitText } from './hilfen';
import { liesPaket } from './lesen';
import { type Abruf, type Handelnder, log, type Quelle } from './optionen';
import { liesZip } from './zip-lesen';
import { PaketHerkunft } from './herkunft';

/** Kataloge, Quellen, Signaturprüfung, Laden und Updates. */
export abstract class PaketKataloge extends PaketHerkunft {
  /** Archive bis ARCHIV_MAX; Katalog, Signatur und Schlüssel sind klein (KLEIN_MAX) – kein JSON von 128 MB (#683). */
  private abruf(url: string, max = ARCHIV_MAX) {
    return this.o.abruf ? this.o.abruf(url) : holeDaten(url, max);
  }

  /** Offizieller Katalog und weitere Adressen aus den Einstellungen. */
  async quellen(): Promise<Quelle[]> {
    const weitere = (await paketQuellen(this.d.kern)).filter((q) => q.url !== this.katalogUrl);
    return [
      { url: this.katalogUrl, offiziell: true, aktiv: true },
      ...weitere.map(({ schluessel, gesperrt, ...q }) => ({
        ...q,
        offiziell: false,
        fingerabdruck: schluessel?.fingerabdruck ?? null,
        gesperrt: gesperrt ? { fingerabdruck: gesperrt.fingerabdruck, seit: gesperrt.am } : null,
      })),
    ];
  }

  /** Öffentlicher Schlüssel neben einem Katalog (katalog.schluessel, #594); null, wenn keiner abrufbar ist. */
  protected async schluesselVon(url: string): Promise<{ s: Schluessel; roh: Buffer } | null> {
    let roh: Buffer;
    try {
      roh = await this.abruf(daneben(url, SCHLUESSEL_DATEI), KLEIN_MAX);
    } catch {
      return null;
    }
    try {
      if (roh.length > SIGNATUR_MAX) throw new Error(`größer als ${SIGNATUR_MAX} Bytes`);
      return { s: liesSchluessel(roh.toString('utf8')), roh };
    } catch (e) {
      throw new Fachfehler(422, t('pakete.herkunft.fehler.schluesseldatei', { url, grund: (e as Error).message }));
    }
  }

  protected async aendereQuelle(url: string, aenderung: Partial<PaketQuelleEintrag>) {
    const liste = await paketQuellen(this.d.kern);
    await setzePaketQuellen(
      this.d.kern,
      liste.map((q) => (q.url === url ? { ...q, ...aenderung } : q)),
    );
  }

  async quelleSchalten(e: { url?: unknown; aktiv?: unknown }, von: Handelnder): Promise<Quelle[]> {
    const url = String(e.url ?? '');
    const liste = await paketQuellen(this.d.kern);
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    const aktiv = e.aktiv === true;
    await setzePaketQuellen(
      this.d.kern,
      liste.map((q) => (q.url === url ? { ...q, aktiv } : q)),
    );
    this.kataloge.delete(url);
    log.warn(aktiv ? 'Paketquelle eingeschaltet' : 'Paketquelle abgeschaltet', { von: von.email, url });
    return this.quellen();
  }

  async quelleEntfernen(url: string, von: Handelnder): Promise<Quelle[]> {
    const liste = await paketQuellen(this.d.kern);
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    await setzePaketQuellen(
      this.d.kern,
      liste.filter((q) => q.url !== url),
    );
    this.kataloge.delete(url);
    log.warn('Paketquelle entfernt', { von: von.email, url });
    return this.quellen();
  }

  /** Nur der offizielle Katalog und eingeschaltete weitere Quellen; alles andere wird nicht abgefragt. */
  protected async erlaubt(url: string | undefined): Promise<string> {
    if (!url || url === this.katalogUrl) return this.katalogUrl;
    if ((await this.quellen()).some((q) => q.url === url && q.aktiv)) return url;
    throw new Fachfehler(422, t('meldungen.pakete.diese-katalogquelle-ist-nicht'));
  }

  /** Einen Katalog abrufen – nur auf Knopfdruck (bzw. für Vorschau und Installation). */
  async katalog(url?: string): Promise<{ url: string; katalog: Katalog; pruefung: HerkunftPruefung; abgerufen: string }> {
    const u = await this.erlaubt(url);
    let daten: Buffer, katalog: Katalog;
    try {
      daten = await this.abruf(u, KLEIN_MAX);
      katalog = liesKatalog(JSON.parse(daten.toString('utf8')));
    } catch (e) {
      throw new Fachfehler(502, t('meldungen.pakete.der-katalog-laesst-sich', { message: (e as Error).message }));
    }
    const pruefung = await this.pruefeKatalog(u, daten, katalog);
    this.kataloge.set(u, { katalog, pruefung, zeit: Date.now() });
    return { url: u, katalog, pruefung, abgerufen: new Date().toISOString() };
  }

  /**
   * Signatur eines abgerufenen Katalogs (#594). Offizieller Katalog: siehe pruefeOffiziell.
   * Eigener Katalog mit bestätigtem Schlüssel: gültige Signatur Pflicht; neuer Schlüssel nur, wenn er mit dem
   * alten signiert ist – sonst ist der Katalog gesperrt, bis ein Admin den neuen bestätigt.
   */
  private async pruefeKatalog(url: string, daten: Buffer, katalog: Katalog): Promise<HerkunftPruefung> {
    if (url === this.katalogUrl) return this.pruefeOffiziell(url, daten, katalog);
    const sig = await this.abruf(daneben(url, SIGNATUR_DATEI), KLEIN_MAX).catch(() => null);
    const q = (await paketQuellen(this.d.kern)).find((x) => x.url === url);
    if (!q?.schluessel) return { art: 'unsigniert', offiziell: false, bestaetigen: true };
    if (q.gesperrt)
      throw new Fachfehler(409, t('pakete.herkunft.fehler.gesperrt', { url, fingerabdruck: q.gesperrt.fingerabdruck }), { gesperrt: true });
    let schluessel = liesSchluessel(q.schluessel.pem);
    let wechsel = false;
    let r: ReturnType<typeof pruefeSignatur> = sig
      ? pruefeSignatur(daten, sig, [schluessel])
      : { ok: false, grund: t('meldungen.pakete.fehlt', { SIGNATUR_DATEI }) };
    if (!r.ok) {
      // Passt die Signatur nicht, hat der Anbieter vielleicht den Schlüssel gewechselt.
      const neu = await this.schluesselVon(url).catch(() => null);
      if (neu && neu.s.fingerabdruck !== schluessel.fingerabdruck) {
        const eintrag = { pem: neu.s.pem, fingerabdruck: neu.s.fingerabdruck, von: null, am: new Date().toISOString() };
        const w = await this.abruf(daneben(url, WECHSEL_DATEI), KLEIN_MAX).catch(() => null);
        if (!w || !pruefeSignatur(neu.roh, w, [schluessel]).ok) {
          await this.aendereQuelle(url, { gesperrt: eintrag });
          this.kataloge.delete(url);
          log.warn('Katalogschlüssel geändert – Katalog gesperrt, bis ein Admin den neuen Schlüssel bestätigt', {
            url,
            bisher: schluessel.fingerabdruck,
            neu: neu.s.fingerabdruck,
          });
          throw new Fachfehler(409, t('pakete.herkunft.fehler.gesperrt', { url, fingerabdruck: neu.s.fingerabdruck }), { gesperrt: true });
        }
        // Geordneter Wechsel: Der neue Schlüssel ist mit dem alten signiert.
        await this.aendereQuelle(url, { schluessel: eintrag, gesperrt: null });
        log.warn('Katalogschlüssel geordnet gewechselt (neuer Schlüssel mit dem bisherigen signiert)', {
          url,
          bisher: schluessel.fingerabdruck,
          neu: neu.s.fingerabdruck,
        });
        schluessel = neu.s;
        wechsel = true;
        if (sig) r = pruefeSignatur(daten, sig, [schluessel]);
      }
    }
    const stand = r.ok ? await this.stand(url, katalog, true) : null;
    if (!r.ok || !stand) {
      const grund = r.ok ? t('meldungen.pakete.ohne-zeitpunkt-erstellt') : r.grund;
      log.warn('Katalogsignatur ungültig', { url, grund });
      throw new Fachfehler(502, t('pakete.herkunft.fehler.signatur', { url, grund }));
    }
    return {
      art: 'anbieter',
      offiziell: false,
      stand,
      fingerabdruck: schluessel.fingerabdruck,
      ...(wechsel ? { wechsel: true } : {}),
      bestaetigen: false,
    };
  }

  /**
   * Offizieller Katalog (#594, #1351): offiziell nur mit gültiger Signatur eines Projektschlüssels und mit Stand.
   * Ohne Signatur (404/410), wenn sie sich nicht abrufen lässt, und wenn sie ungültig ist: nicht offiziell, die
   * Herkunft muss bestätigt werden. Ältere Stände als der zuletzt signiert gesehene lehnt Ablago auch dann ab.
   */
  private async pruefeOffiziell(url: string, daten: Buffer, katalog: Katalog): Promise<HerkunftPruefung> {
    let sig: Buffer;
    try {
      sig = await this.abruf(daneben(url, SIGNATUR_DATEI), KLEIN_MAX);
    } catch (e) {
      const status = e instanceof Fachfehler ? (e.details as { status?: number } | undefined)?.status : undefined;
      const fehlt = status === 404 || status === 410;
      log.warn(fehlt ? 'Offizieller Katalog ohne Signatur' : 'Signatur des offiziellen Katalogs nicht abrufbar', {
        url,
        grund: (e as Error).message,
      });
      await this.stand(url, katalog, true, false);
      return { art: fehlt ? 'unsigniert' : 'nichtgeprueft', offiziell: false, bestaetigen: true };
    }
    const r = pruefeSignatur(daten, sig, projektSchluessel(this.o.projektSchluessel));
    const stand = await this.stand(url, katalog, true, r.ok);
    if (!r.ok || !stand) {
      log.warn('Katalogsignatur ungültig', { url, grund: r.ok ? 'ohne Zeitpunkt (erstellt)' : r.grund });
      return { art: 'ungueltig', offiziell: false, bestaetigen: true };
    }
    return {
      art: 'projekt',
      offiziell: true,
      stand,
      ...(nurTestschluessel(this.o.projektSchluessel) ? { test: true } : {}),
      bestaetigen: false,
    };
  }

  /**
   * Stand (`erstellt`) eines Katalogs gegen den neuesten bisher signiert gesehenen (#594). Online lehnt das DMS
   * ältere ab – sie könnten untergeschoben sein; offline (Sammeldatei) zeigt es nur den Stand. Merken nur bei
   * gültiger Signatur (`merken`), sonst wäre der Zeitpunkt nicht belegt.
   */
  protected async stand(url: string, katalog: Katalog, online: boolean, merken = true): Promise<string | null> {
    const zeit = zeitVon(katalog.erstellt);
    if (Number.isNaN(zeit)) return null;
    const gesehen = (await paketKatalogStaende(this.d.kern))[url];
    if (gesehen && zeit < zeitVon(gesehen)) {
      if (!online) return katalog.erstellt;
      log.warn('Älterer signierter Katalog abgelehnt', { url, stand: katalog.erstellt, gesehen });
      throw new Fachfehler(
        502,
        t('pakete.herkunft.fehler.zurueck', { url, stand: zeitText(katalog.erstellt), gesehen: zeitText(gesehen) }),
      );
    }
    if (merken && (!gesehen || zeit > zeitVon(gesehen))) await setzePaketKatalogStand(this.d.kern, url, katalog.erstellt);
    return katalog.erstellt;
  }

  /** Normale Ansicht: nur der offizielle Katalog; erweiterte Ansicht: auch die eingeschalteten weiteren. */
  async abrufen(alle: boolean): Promise<{ kataloge: Abruf[]; abgerufen: string }> {
    const quellen = (await this.quellen()).filter((q) => q.offiziell || (alle && q.aktiv));
    const kataloge = await Promise.all(
      quellen.map(async (q): Promise<Abruf> => {
        try {
          const k = await this.katalog(q.url);
          return { url: q.url, offiziell: q.offiziell, katalog: k.katalog, pruefung: k.pruefung, fehler: null };
        } catch (e) {
          return { url: q.url, offiziell: q.offiziell, katalog: null, pruefung: null, fehler: (e as Error).message };
        }
      }),
    );
    return { kataloge, abgerufen: new Date().toISOString() };
  }

  /** Zuletzt abgerufener Katalog einer Quelle, wenn er höchstens 15 Minuten alt ist; sonst neu. */
  protected async aktuellerKatalog(url?: string) {
    const u = await this.erlaubt(url);
    const k = this.kataloge.get(u);
    if (k && Date.now() - k.zeit < 15 * 60_000) return { url: u, katalog: k.katalog, pruefung: k.pruefung };
    const neu = await this.katalog(u);
    return { url: neu.url, katalog: neu.katalog, pruefung: neu.pruefung };
  }

  /** Installierte Pakete; mit „Einstellungen nötig“, wenn Pflichtfelder fehlen (#197). */
  async installierte(): Promise<Array<InstalliertesPaket & { einstellungenNoetig?: boolean }>> {
    const mitSprache = (p: InstalliertesPaket): InstalliertesPaket => {
      const a = p.sprache ? this.o.sprachen?.abdeckung?.(p.sprache.kennung) : null;
      return a == null ? p : { ...p, spracheAbdeckung: a };
    };
    // KI-Pakete (#996): Warnzeichen am Reiter, solange das Paket aus keinem Mappentyp Inhalte bekommt.
    const pakete = await this.d.kern.repo.listePakete();
    const ki = pakete.some((p) => istKiPaket(p.laeufer)) ? await this.d.ki.kiUebersicht().catch(() => null) : null;
    const kiOhne = (p: InstalliertesPaket) => istKiPaket(p.laeufer) && !!ki && !ki.pakete.find((x) => x.id === p.id)?.bekommt.length;
    // Beschädigt (#1551): eigene Mappentypen oder Ansichten fehlen – die Paketseite bietet Lösungen an.
    const typIds = new Set((await this.d.mappentypen.listeTypen()).map((x) => x.id));
    const sichtIds = new Set((await this.d.sichtenVerwaltung.listeSichten()).map((x) => x.id));
    const mitBestand = (p: InstalliertesPaket) => {
      const fehlt = fehlendeTeile(p, typIds, sichtIds);
      return fehlt ? { ...p, fehlt } : p;
    };
    return Promise.all(
      pakete.map(mitBestand).map(async (p) =>
        p.einstellungen
          ? {
              ...p,
              einstellungenNoetig:
                kiOhne(p) || fehlendePflicht(p.einstellungen, (await paketEinstellungen(this.d.kern, p.id))?.werte ?? {}).length > 0,
            }
          : kiOhne(p)
            ? { ...mitSprache(p), einstellungenNoetig: true }
            : mitSprache(p),
      ),
    );
  }

  /** Paket einer Version aus einem Katalog holen und gegen die Prüfsumme prüfen. */
  /** umzug (#1084): Fehlt die Id im Katalog, gilt das Paket, das sie unter `ersetzt` nennt (Update unter neuer Id). */
  async lade(
    id: string,
    version?: string,
    quelle?: string,
    umzug = false,
  ): Promise<{ paket: Paket; kp: KatalogPaket; v: KatalogVersion; url: string; katalog: Katalog; pruefung: HerkunftPruefung }> {
    const { katalog, url, pruefung } = await this.aktuellerKatalog(quelle);
    const kp = umzug ? katalogPaketZu(katalog, id) : katalog.pakete.find((p) => p.id === id);
    if (!kp) throw new Fachfehler(404, t('meldungen.pakete.das-paket-gibt-es', { id }));
    const v = version
      ? kp.versionen.find((x) => x.version === version)
      : (kp.versionen.find((x) => x.version === kp.aktuell) ?? kp.versionen[0]);
    if (!v) throw new Fachfehler(404, t('meldungen.pakete.version-von-gibt-es', { version: String(version), name: kp.name }));
    if (v.groesse > ARCHIV_MAX)
      throw new Fachfehler(
        422,
        t('meldungen.pakete.das-paket-laesst-sich', {
          wert: t('pakete.groesse.zuGross', { groesse: inMB(v.groesse), max: inMB(ARCHIV_MAX) }),
        }),
      );
    let daten: Buffer;
    try {
      daten = await this.abruf(new URL(v.archiv, url).toString());
    } catch (e) {
      throw new Fachfehler(502, t('meldungen.pakete.das-paket-laesst-sich-2', { message: (e as Error).message }));
    }
    if (createHash('sha256').update(daten).digest('hex') !== v.sha256)
      throw new Fachfehler(422, t('meldungen.pakete.die-pruefsumme-von-passt', { name: kp.name, version: v.version }));
    const paket = liesPaket(liesZip(daten));
    if (paket.manifest.id !== kp.id || paket.manifest.version !== v.version || (kp.id !== id && !paket.manifest.ersetzt?.includes(id)))
      throw new Fachfehler(
        422,
        t('meldungen.pakete.das-archiv-enthaelt-statt', {
          id: paket.manifest.id,
          version: paket.manifest.version,
          id2: kp.id,
          version2: v.version,
        }),
      );
    return { paket, kp, v, url, katalog, pruefung };
  }

  /** Abhängigkeiten eines hochgeladenen Pakets kommen aus dem offiziellen Katalog (wenn schon abgerufen). */
  /** Der zuletzt abgerufene offizielle Katalog – nur mit gültiger Signatur (#1351), sonst wie nicht abgerufen. */
  protected async offiziell(): Promise<Katalog | undefined> {
    const k = this.kataloge.get(this.katalogUrl);
    return k?.pruefung.art === 'projekt' ? k.katalog : undefined;
  }

  /** Neuere Versionen (auf Knopfdruck) – je Paket nur in der Quelle, aus der es stammt. */
  async updates(): Promise<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }>> {
    const erg = [];
    const quellen = await this.quellen();
    const geholt = new Map<string, Katalog | null>();
    for (const p of await this.d.kern.repo.listePakete()) {
      if (p.herkunft.art !== 'katalog') continue;
      const url = p.herkunft.url;
      if (!quellen.some((q) => q.url === url && q.aktiv)) continue;
      if (!geholt.has(url))
        geholt.set(
          url,
          await this.katalog(url).then(
            (k) => k.katalog,
            (e) => {
              if (url === this.katalogUrl) throw e;
              return null;
            },
          ),
        );
      // Umgezogen (#1084): Das Update kommt unter der neuen Id, die die alte unter `ersetzt` nennt.
      const k = geholt.get(url);
      const kp = k ? katalogPaketZu(k, p.id) : undefined;
      const v = kp?.versionen.find((x) => x.version === kp.aktuell) ?? kp?.versionen[0];
      if (v && vergleicheVersion(v.version, p.version) > 0)
        erg.push({ id: p.id, installiert: p.version, neu: v.version, changelog: v.changelog, quelle: url });
    }
    return erg;
  }
}
