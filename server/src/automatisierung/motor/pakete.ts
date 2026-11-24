/**
 * Mitgelieferte Automatisierungen aus Paketen (#1278, Teil von `Automatisierungen`): Mappentyp entfernt oder umgebaut,
 * Vergleich und Übernahme beim Installieren.
 */
import { AutomatisierungAussen } from './aussen';
import type { PaketAutomatisierung } from '../../pakete/verwaltung/index';
import {
  type Angehalten,
  DMS_POST,
  bereinigeAutomatisierung,
  automatisierungsProbleme,
  REIHENFOLGE,
  type Automatisierung,
  type AutomatisierungDaten,
} from '../../../../shared/src/automatisierung';
import { log, t } from './gemeinsam';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { mitWerkbankKarte, paketAutomatisierungId, fassungsStand, uuidAus } from './hilfen';
import { beschreibeAenderungen } from '../../../../shared/src/fassungsvergleich';
import { UMZUG_VERTRETUNG, umzugFuer, UMZUG_IDS } from './umzug';

/** Automatisierungen aus Paketen und Umbau von Mappentypen. */
export abstract class AutomatisierungPakete extends AutomatisierungAussen {
  /**
   * Mitgelieferte Automatisierungen eines Pakets (#712, dms-registry #108): je Schlüssel eine mit fester Id, Herkunft
   * „aus Paket“, nach der Installation **aus** (eingeschaltet wird im Einrichtungsassistenten bzw. von Hand). Typen im
   * Paket als eigener Schlüssel oder `paket:typ` → Id. Bei einem Update ersetzt die neue Fassung die alte, solange
   * niemand sie geändert hat (an/aus bleibt); eine geänderte bleibt, wie sie ist. Was das Paket nicht mehr mitbringt,
   * fällt weg, wenn es unverändert und aus ist. `ein`: Schlüssel, die beim Installieren angehakt wurden – neu angelegte
   * davon sind gleich eingeschaltet. Gibt es für dasselbe Datumsfeld schon eine beim Update übernommene Erinnerung
   * (fristenUebernehmen), ersetzt die mitgelieferte sie, solange sie unverändert ist (an/aus bleibt); ist sie geändert,
   * bleibt sie und die mitgelieferte entsteht nicht – so erinnert nie etwas doppelt.
   */
  /** Mitgelieferte Automatisierung mit unbekanntem Mappentyp (#1084): angehalten statt auf alle Typen. */
  private haltOhneTyp(paket: string, x: PaketAutomatisierung, typId: (vw: unknown) => string | null): Angehalten | null {
    if (typeof x.wenn.typ !== 'string' || !x.wenn.typ || typId(x.wenn.typ)) return null;
    log.warn('Mitgelieferte Automatisierung angehalten: Mappentyp unbekannt', { paket, automatisierung: x.schluessel, typ: x.wenn.typ });
    return { grund: 'fehlerhaft', text: t('automatisierung.angehalten.typ-unbekannt', { typ: x.wenn.typ }), zeit: this.iso() };
  }

  /**
   * Paket-Umbau (#1041): Automatisierungen, die den alten Typ nennen, zeigen danach auf den Zieltyp; hängen sie an ihm
   * (Auslöser), nennen ihre Karten die neuen Feldkennungen. Als neue Fassung im Änderungsverlauf, an/aus bleibt.
   */
  async typUmgebaut(alt: string, neu: string, felder: Record<string, string>): Promise<number> {
    let n = 0;
    const umbenennen = (x: unknown, typAm: boolean): unknown => {
      if (typeof x === 'string')
        return x === alt
          ? neu
          : typAm
            ? x.replace(/\{([a-z][a-z0-9_]*)([|}])/g, (g, k: string, r: string) => (felder[k] ? `{${felder[k]}${r}` : g))
            : x;
      if (Array.isArray(x)) return x.map((y) => umbenennen(y, typAm));
      if (!x || typeof x !== 'object') return x;
      return Object.fromEntries(
        Object.entries(x).map(([k, v]) => [
          k,
          typAm && (k === 'feld' || k === 'key') && typeof v === 'string' && felder[v] ? felder[v] : umbenennen(v, typAm),
        ]),
      );
    };
    for (const a of await this.d.repo.liste()) {
      const roh = { wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst };
      if (!JSON.stringify(roh).includes(alt)) continue;
      const amTyp = (a.wenn as { typ?: string | null }).typ === alt;
      const x = umbenennen(roh, amTyp) as typeof roh;
      await this.d.repo.speichere(a.id, { ...a, ...x }, null, a.version);
      n++;
    }
    if (n) log.info('Automatisierungen nach Paket-Umbau umgeleitet', { anzahl: n, typ: alt, ziel: neu });
    return n;
  }

  /**
   * Wie eine mitgelieferte Automatisierung in dieser Ablage aussieht: Typen des Pakets auf die installierten, „Paket nach
   * Zeitplan ausführen“ auf das Paket selbst, Reihenfolge der Pakete. Für ausPaket und die Update-Vorschau (#1174).
   */
  private async paketUmsetzer(p: Pick<InstalliertesPaket, 'id' | 'typen'>) {
    const pakete = await this.d.dienst.kern.repo.listePakete();
    // Post von Ablago (#1001): `dms:post` – Automatisierungen auf Post brauchen keinen eigenen Mappentyp.
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const typId = (vw: unknown): string | null => {
      if (typeof vw !== 'string' || !vw) return null;
      if (vw === DMS_POST) return postTyp;
      const [pk, sl] = vw.includes(':') ? vw.split(':') : [p.id, vw];
      return (pk === p.id ? p.typen[sl] : pakete.find((x) => x.id === pk)?.typen[sl]) ?? null;
    };
    const daten = (x: PaketAutomatisierung) => {
      // „Paket nach Zeitplan ausführen“ (#1082): Im Paket steht kein Ziel – es ist immer das Paket selbst.
      const dann = x.dann.map((k) =>
        k && typeof k === 'object' && (k as Record<string, unknown>).art === 'paket' ? { ...k, paket: p.id } : k,
      );
      const d = bereinigeAutomatisierung({
        name: x.name,
        beschreibung: x.beschreibung,
        wenn: { ...x.wenn, typ: typId(x.wenn.typ) },
        und: x.und,
        dann,
      });
      d.reihenfolge = REIHENFOLGE.paket;
      return d;
    };
    return { typId, postTyp, daten };
  }

  /**
   * Update-Vorschau (#1174): mitgelieferte Automatisierungen, die jemand geändert hat, bleiben beim Update, wie sie sind.
   * Je solcher Automatisierung, was die neue Fassung aus dem Paket anders macht – lesbar wie bei den Fassungen.
   * Gleich geblieben (die eigene Änderung entspricht dem Paket) fällt weg.
   */
  async paketVergleich(
    p: InstalliertesPaket,
    liste: PaketAutomatisierung[],
  ): Promise<Record<string, { id: string; aenderungen: string[] }>> {
    const { daten } = await this.paketUmsetzer(p);
    const vorhanden = (await this.d.repo.liste()).filter((a) => a.herkunft === 'paket' && a.paketId === p.id);
    const kontext = { automatisierung: await this.kontext() };
    const aus: Record<string, { id: string; aenderungen: string[] }> = {};
    for (const x of liste.filter((y) => !mitWerkbankKarte(p.id, y))) {
      const da = vorhanden.find((a) => a.id === paketAutomatisierungId(p, x.schluessel, vorhanden));
      if (!da || da.geaendertVon === null) continue;
      const aenderungen = beschreibeAenderungen(
        'automatisierung',
        fassungsStand(da),
        fassungsStand({ ...daten(x), aktiv: da.aktiv }),
        kontext,
      );
      if (aenderungen.length) aus[x.schluessel] = { id: da.id, aenderungen };
    }
    return aus;
  }

  async ausPaket(p: InstalliertesPaket, liste: PaketAutomatisierung[], ein: string[] = []): Promise<number> {
    const { typId, postTyp, daten } = await this.paketUmsetzer(p);
    const vorhanden = (await this.d.repo.liste()).filter((a) => a.herkunft === 'paket' && a.paketId === p.id);
    const ids = new Set<string>();
    let neu = 0;
    // Werkbank-Karten (#677) gibt es nur in selbst angelegten Automatisierungen – die Prüfung beim Installieren lehnt sie ab.
    for (const x of liste.filter((y) => !mitWerkbankKarte(p.id, y))) {
      // Nach einem Umzug (#1084) behält eine mitgelieferte Automatisierung ihre Id aus der früheren Paket-Id.
      const id = paketAutomatisierungId(p, x.schluessel, vorhanden);
      ids.add(id);
      const d = daten(x);
      // Unbekannter Mappentyp (#1084, Sicherheit A): geschlossen statt offen – ohne Typ liefe sie auf alle; sie hält an.
      const halt = this.haltOhneTyp(p.id, x, typId);
      const da = vorhanden.find((a) => a.id === id);
      if (da) {
        if (da.geaendertVon === null) await this.d.repo.speichere(id, { ...d, aktiv: da.aktiv }, null, da.version);
        else await this.verknuepfeNeu(da, d);
        if (halt) await this.d.repo.setze(id, { angehalten: halt });
        else await this.wiederGueltig(id);
        continue;
      }
      let aktiv = ein.includes(x.schluessel);
      const uebernommeneId =
        d.wenn.art === 'datum'
          ? uuidAus(`frist|${d.wenn.typ}|${d.wenn.feld}`)
          : d.wenn.art === 'benutzer.abwesenheit_gesetzt'
            ? UMZUG_VERTRETUNG
            : umzugFuer(d, postTyp);
      if (uebernommeneId) {
        const alt = await this.d.repo.hole(uebernommeneId);
        if (alt && alt.geaendertVon !== null) {
          log.info('Mitgelieferte Automatisierung nicht angelegt: die übernommene Erinnerung wurde geändert', {
            paket: p.id,
            automatisierung: x.schluessel,
            bleibt: alt.id,
          });
          continue;
        }
        if (alt) {
          aktiv = alt.aktiv;
          await this.d.repo.loesche(alt.id);
        }
      }
      const a: Automatisierung = {
        ...d,
        id,
        aktiv: aktiv && !halt,
        angehalten: halt,
        herkunft: 'paket',
        paketId: p.id,
        version: 1,
        erstellt: this.iso(),
        erstelltVon: null,
        geaendert: this.iso(),
        geaendertVon: null,
      };
      try {
        await this.d.repo.lege(a);
        neu++;
      } catch {
        /* ein anderer Server war schneller */
      }
    }
    await this.nichtMehrMitgeliefert(p, vorhanden, ids);
    if (neu) log.info('Automatisierungen aus Paket angelegt (aus)', { paket: p.id, anzahl: neu });
    return neu;
  }

  /**
   * Nicht mehr mitgeliefert: weg, wenn aus und unverändert – übernommene Erinnerungen am Feld bleiben. Paket entfernt
   * (#1586): Unveränderte, die ohne das Paket nicht mehr passen (Mappentyp weg), gehen auch eingeschaltet mit.
   */
  private async nichtMehrMitgeliefert(p: Pick<InstalliertesPaket, 'id'>, vorhanden: Automatisierung[], ids: Set<string>) {
    const uebernommen = (a: Automatisierung) =>
      UMZUG_IDS.has(a.id) || (a.wenn.art === 'datum' && a.id === uuidAus(`frist|${a.wenn.typ}|${a.wenn.feld}`));
    const entfernt = !(await this.d.dienst.kern.repo.listePakete()).some((x) => x.id === p.id);
    const k = entfernt ? await this.kontext() : null;
    for (const a of vorhanden) {
      if (ids.has(a.id) || a.geaendertVon !== null || uebernommen(a)) continue;
      if (!a.aktiv || (k && automatisierungsProbleme(a, k).length)) await this.d.repo.loesche(a.id);
    }
  }

  /**
   * Neu installiert (#1586): Eine geänderte mitgelieferte Automatisierung bleibt, wie sie ist – zeigt ihre Wenn-Karte
   * aber auf einen Mappentyp, den es nicht mehr gibt (Paket entfernt, Typ mit neuer Id angelegt), zeigt sie danach auf
   * den neuen Typ des Pakets. Gilt weiter als geändert.
   */
  private async verknuepfeNeu(da: Automatisierung, d: AutomatisierungDaten) {
    const alt = (da.wenn as { typ?: unknown }).typ;
    const neu = (d.wenn as { typ?: unknown }).typ;
    if (typeof alt !== 'string' || !alt || typeof neu !== 'string' || !neu || alt === neu) return;
    if ((await this.d.dienst.mappentypen.listeTypen()).some((x) => x.id === alt)) return;
    const roh = { wenn: da.wenn, und: da.und, dann: da.dann, sonst: da.sonst };
    const x = JSON.parse(JSON.stringify(roh).split(alt).join(neu)) as typeof roh;
    if (await this.d.repo.speichere(da.id, { ...da, ...x }, da.geaendertVon, da.version))
      log.info('Mitgelieferte Automatisierung mit dem neuen Mappentyp verknüpft', { id: da.id, name: da.name, typ: neu });
  }

  /** Nach dem Installieren gültig: „angehalten, passt nicht mehr“ ist behoben (#1586) – wie beim Speichern im Editor. */
  private async wiederGueltig(id: string) {
    const a = await this.d.repo.hole(id);
    if (a?.angehalten?.grund !== 'fehlerhaft' || automatisierungsProbleme(a, await this.kontext()).length) return;
    await this.d.repo.setze(id, { angehalten: null });
  }
}
