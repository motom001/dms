/** Wiederherstellung (#1278 aus wiederherstellung.ts): der eigentliche Lauf – einspielen, prüfen, umschalten oder aufräumen. */
import { randomBytes } from 'node:crypto';
import { join, dirname, sep } from 'node:path';
import type postgres from 'postgres';
import { stat, readFile, mkdir, rm, readdir, rename, writeFile } from 'node:fs/promises';
import { WiederherstellungBasis } from './wiederherstellung-basis';
import {
  type Wiederherstellungslauf,
  type Abgleich,
  STAGING,
  BEHALTEN_TAGE,
  log,
  ERWEITERUNGEN_SCHRITT,
  type Abschluss,
  BEHALTEN,
  ALT,
} from './wiederherstellung-hilfen';
import { t } from '../sprache/sprache';
import { sha256Von } from './sicherungsformat';
import { bezeichner } from './datenbankabzug';
import { istPruefwort, entschluesseleMit } from '../geheimnisse/tresor';
import { FASSUNG_PFAD } from '../dateien/dateiumwandlung';
import { ARCHIV_PFAD, WOERTER_PFAD } from '../dateien/archivfassung';
import { migriere } from '../datenbank/db';
import { liesErweiterungen, trigrammIndizes, problemeAus, beschreibe, TRIGRAMM_INDEXNAMEN } from '../datenbank/erweiterungen';
import { type WhStand, type Eingespielt, legeSchemaAn, liesEin, pruefeFassungen, zieheNach } from './wiederherstellung-einspielen';

type Art = 'frisch' | 'laufend' | 'probe';
/** Anzahl der eingespielten Mappen, Dokumente und Benutzer. */
type Ist = { mappen: number; dokumente: number; benutzer: number };

export abstract class WiederherstellungAusfuehren extends WiederherstellungBasis {
  /** Der eigentliche Ablauf. Bei Probe: nie umschalten, immer aufräumen. */
  protected async fuehreAus(lauf: Wiederherstellungslauf, a: Abgleich, k: Buffer, art: Art): Promise<boolean> {
    const st = this.neuerStand(lauf, a, art);
    try {
      await this.sichereJetzigenStand(st, art);
      const pfad = await this.pruefePruefsumme(st);
      st.schritt(t('meldungen.wiederherstellung.entschluesseln-und-einspielen'));
      await legeSchemaAn(st);
      const z = await liesEin(st, pfad, k);
      await pruefeFassungen(st, z);
      await zieheNach(st);
      await this.pruefePruefwort(st, k);
      const ist = await this.pruefeAnzahl(st, z);
      await this.bringeAufStand(st);
      await this.pruefeErweiterungen(st);
      if (st.probe) return await this.beendeProbe(st, ist, z.dateien);
      const abschluss = await this.bereiteAbschlussVor(st);
      await this.uebernimmDateien(st);
      await this.legeSchluesselAb(st, k);
      await this.schalteUm(st, abschluss, ist, z.dateien);
      return true;
    } catch (e) {
      await this.brichAb(st, e as Error);
      return false;
    }
  }

  /** Stand eines Laufs: Namen von Schema und Ordner, offene Verbindungen und Ströme, laufender Schritt. */
  private neuerStand(lauf: Wiederherstellungslauf, a: Abgleich, art: Art): WhStand {
    const stempel = `${this.jetzt().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
    const st: WhStand = {
      q: this.q,
      lauf,
      a,
      m: a.meta,
      probe: art === 'probe',
      stempel,
      schema: `${STAGING}${stempel}`,
      staging: join(this.q.dateiWurzel, `.wiederherstellung-${stempel}`),
      neu: null,
      w: null,
      schluesselZurueck: null,
      behalten: false,
      aktuell: null,
      schritt: (name) => {
        st.aktuell = name;
        this.schritt(lauf, name, 'laeuft');
      },
      ok: (info) => {
        if (st.aktuell) this.schritt(lauf, st.aktuell, 'ok', info);
      },
      melde: (name, status, info) => this.schritt(lauf, name, status, info),
    };
    return st;
  }

  /** Auf dem laufenden System zuerst den jetzigen Stand sichern – ohne (passenden) Schlüssel nur ein Hinweis. */
  private async sichereJetzigenStand(st: WhStand, art: Art) {
    const { lauf } = st;
    if (art === 'laufend' && !this.q.tresor.alsText()) {
      // Ohne (passenden) Schlüssel lässt sich der jetzige Stand nicht sichern – z. B. wenn er verloren ist.
      // Dann bleibt das alte Schema nach dem Umschalten noch eine Weile in der Datenbank.
      st.behalten = true;
      st.melde(
        t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'),
        'hinweis',
        t('meldungen.wiederherstellung.nicht-moeglich-diese-installation', { BEHALTEN_TAGE }),
      );
    } else if (art === 'laufend') {
      st.schritt(t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'));
      const { fertig } = await this.q.sicherung.starte('vor-wiederherstellung', lauf.von);
      const vorher = await fertig;
      if (!vorher)
        throw new Error(
          `Die Sicherung des jetzigen Stands ist fehlgeschlagen: ${this.q.sicherung.aktuellerLauf()?.fehler ?? 'unbekannt'}. Ohne sie wird nichts ersetzt.`,
        );
      st.ok(vorher.datei);
    }
  }

  /** Prüfsumme der Sicherungsdatei gegen die Metadaten; liefert ihren Pfad. */
  private async pruefePruefsumme(st: WhStand): Promise<string> {
    const { lauf, m } = st;
    st.schritt(t('meldungen.wiederherstellung.pruefsumme-der-datei'));
    const pfad = join(this.q.sicherung.ordner, m.datei);
    lauf.gesamt = (await stat(pfad)).size;
    const sha = await sha256Von(pfad, (n) => {
      lauf.bytes = n;
    });
    if (sha !== m.sha256)
      throw new Error(
        'Die Prüfsumme der Sicherungsdatei stimmt nicht mit den Metadaten überein – die Datei ist verändert oder beschädigt.',
      );
    st.ok('unverändert');
    return pfad;
  }

  /** Das Prüfwort der Sicherung muss sich mit dem Schlüssel lesen lassen. */
  private async pruefePruefwort(st: WhStand, k: Buffer) {
    st.schritt(t('meldungen.wiederherstellung.pruefwort'));
    const [pw] = await st.neu!`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort' LIMIT 1`;
    if (!pw) st.melde(t('meldungen.wiederherstellung.pruefwort'), 'hinweis', t('meldungen.wiederherstellung.die-sicherung-enthaelt-noch'));
    else if (!istPruefwort(entschluesseleMit(k, String(pw.wert))))
      throw new Error('Das Prüfwort lässt sich mit diesem Schlüssel nicht lesen – der Schlüssel passt nicht zu den Daten.');
    else st.ok(t('meldungen.wiederherstellung.mit-dem-schluessel-lesbar'));
  }

  /** Anzahl der Mappen, Dokumente, Benutzer und Dateien gegen die Sicherung. */
  private async pruefeAnzahl(st: WhStand, z: Eingespielt): Promise<Ist> {
    const { m, schema } = st;
    st.schritt(t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'));
    const n = async (t: string) =>
      Number((await st.neu!.unsafe(`SELECT count(*)::int AS n FROM ${bezeichner(schema)}.${bezeichner(t)}`))[0].n);
    const ist = { mappen: await n('mappen'), dokumente: await n('dokumente'), benutzer: await n('benutzer') };
    const soll = z.zaehlerSicherung ?? m.anzahl;
    const abw = (['mappen', 'dokumente', 'benutzer'] as const).filter((x) => ist[x] !== Number(soll[x]));
    if (abw.length) throw new Error(`Die Anzahl stimmt nicht: ${abw.map((x) => `${x} ${ist[x]} statt ${soll[x]}`).join(', ')}.`);
    // Kopie außer Haus mit schlanken Metadaten (#585): Anzahl aus dem Endeintrag der Sicherung (dateienEnde).
    const dateienSoll = m.anzahl.dateien >= 0 ? m.anzahl.dateien : z.dateienEnde;
    if (dateienSoll !== z.dateien)
      throw new Error(`Die Anzahl der Dateien stimmt nicht: ${z.dateien} statt ${dateienSoll ?? 'unbekannt'}.`);
    st.ok(
      t('meldungen.wiederherstellung.mappen-dokumente-benutzer', {
        mappen: ist.mappen,
        dokumente: ist.dokumente,
        benutzer: ist.benutzer,
      }),
    );
    return ist;
  }

  /** Das neue Schema auf den heutigen Stand migrieren; Automatisierungen anhalten (#674). */
  private async bringeAufStand(st: WhStand) {
    const neu = st.neu!;
    st.schritt(t('meldungen.wiederherstellung.auf-den-heutigen-stand'));
    const vorher = st.m.migrationen.length;
    await migriere(neu, this.q.migrationen, () => {});
    const nachher = Number((await neu`SELECT count(*)::int AS n FROM schema_migrationen`)[0].n);
    st.ok(
      nachher > vorher
        ? t('meldungen.wiederherstellung.aenderungen-ausgefuehrt', { wert: nachher - vorher })
        : t('meldungen.wiederherstellung.schon-aktuell'),
    );
    // Automatisierungen (#674): nach einer Wiederherstellung vorhanden, aber angehalten, bis ein Admin sie einschaltet.
    if (!st.probe)
      await neu`UPDATE automatisierungen SET angehalten = ${neu.json({ grund: 'wiederherstellung', text: 'Angehalten nach einer Wiederherstellung. Prüfe die Automatisierung und schalte sie wieder ein.', zeit: new Date().toISOString() })}
        WHERE aktiv AND angehalten IS NULL`;
  }

  /**
   * Erweiterungen (#562): Fehlt pg_trgm oder unaccent, läuft die Suche nach dem Umschalten schlechter – das soll
   * vorher sichtbar sein, nicht still passieren. Die Daten sind trotzdem vollständig, daher nur ein Hinweis.
   */
  private async pruefeErweiterungen(st: WhStand) {
    st.schritt(ERWEITERUNGEN_SCHRITT);
    const erweiterungen = await liesErweiterungen(this.q.sql);
    const mitTrgm = erweiterungen.some((e) => e.name === 'pg_trgm' && e.zustand !== 'fehlt');
    const indizes = mitTrgm ? await trigrammIndizes(st.neu!, st.schema) : [];
    const fehlt = [
      ...problemeAus(erweiterungen).map(beschreibe),
      ...(mitTrgm
        ? TRIGRAMM_INDEXNAMEN.filter((n) => !indizes.includes(n)).map((n) => t('meldungen.wiederherstellung.trigramm-index-fehlt', { n }))
        : []),
    ];
    if (fehlt.length) {
      const text = `${fehlt.join('; ')}. Die Daten sind vollständig; Abhilfe steht unter Werkbank → Systemzustand.`;
      st.melde(ERWEITERUNGEN_SCHRITT, 'hinweis', text);
      st.a.hinweise.push(t('meldungen.wiederherstellung.erweiterungen-der-datenbank-2', { text }));
      log.warn('Erweiterungen der Datenbank unvollständig', { probe: st.probe, fehlt: fehlt.join('; ') });
    } else st.ok(t('meldungen.wiederherstellung.pg-trgm-und-unaccent'));
  }

  /** Probe: aufräumen, Ergebnis merken, dann „fertig“. */
  private async beendeProbe(st: WhStand, ist: Ist, dateien: number): Promise<boolean> {
    const { lauf } = st;
    st.schritt(t('meldungen.wiederherstellung.aufraeumen'));
    await st.neu!.end();
    st.neu = null;
    await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(st.schema)} CASCADE`);
    st.ok();
    // Erst merken, dann melden (#1381, wie #1378): Der Lauf wechselt genau einmal von „läuft“ auf „fertig“ oder
    // „fehler“. Scheitert das Merken, endet er wie bisher über den catch mit „fehler“ – nie „fertig“ → „fehler“.
    try {
      await this.merkeProbe(lauf.sicherung, true, lauf.schritte.map((s) => `${s.name}: ${s.info ?? s.status}`).join('; '));
    } catch (e) {
      // Aufgeräumt ist richtig, gescheitert ist nur das Speichern des Ergebnisses (#1383): kein Schritt als fehlgeschlagen.
      st.aktuell = null;
      lauf.ergebnisNichtGespeichert = true;
      throw e;
    }
    log.info('Probe-Wiederherstellung erfolgreich', { sicherung: lauf.sicherung, mappen: ist.mappen, dateien });
    lauf.beendet = this.jetzt().toISOString();
    lauf.status = 'fertig';
    return true;
  }

  /** Abschlussmeldung vorbereiten; Ende des Wartungsmodus und verteilte Ereignisse stehen schon in der neuen Datenbank. */
  private async bereiteAbschlussVor(st: WhStand): Promise<Abschluss> {
    const { lauf } = st;
    const neu = st.neu!;
    const hinweise = [...st.a.hinweise.filter((h) => !/Notfallblatt ein/.test(h))];
    const abschluss: Abschluss = { am: this.jetzt().toISOString(), sicherung: lauf.sicherung, von: lauf.von, schritte: [], hinweise };
    await neu`DELETE FROM einstellungen WHERE schluessel = 'wartung'`;
    // Ereignisse (#670) aus der Zeit vor der Sicherung nicht noch einmal verteilen.
    const [{ da }] = await neu<{ da: string | null }[]>`SELECT to_regclass('ereignisse')::text AS da`;
    if (da) await neu`UPDATE ereignisse SET verteilt = now() WHERE verteilt IS NULL`;
    return abschluss;
  }

  /** Dateien aus dem Ordner der Wiederherstellung übernehmen. */
  private async uebernimmDateien(st: WhStand) {
    const { staging } = st;
    st.schritt(t('meldungen.wiederherstellung.dateien-uebernehmen'));
    let uebernommen = 0;
    let schonDa = 0;
    for (const d of await readdir(staging, { recursive: true, withFileTypes: true })) {
      if (!d.isFile()) continue;
      const quelle = join(d.parentPath ?? (d as unknown as { path: string }).path, d.name);
      const rel = quelle.slice(staging.length + 1);
      const ziel = join(this.q.dateiWurzel, rel);
      // Gleicher Prüfwert = gleicher Inhalt. Nicht bei Fassungen (#577): Ihr Name ist der Prüfwert des Originals – die
      // aus der Sicherung ersetzt eine inzwischen anders umgewandelte, damit alles so dasteht wie damals.
      // Archivfassungen, ihr Stand und die Wortpositionen (#631) ebenso.
      const innen = rel.split(sep).slice(1).join('/');
      const istFassung = FASSUNG_PFAD.test(innen) || ARCHIV_PFAD.test(innen) || WOERTER_PFAD.test(innen);
      if (
        !istFassung &&
        (await stat(ziel).then(
          () => true,
          () => false,
        ))
      ) {
        schonDa++;
        continue;
      }
      await mkdir(dirname(ziel), { recursive: true });
      await rename(quelle, ziel);
      uebernommen++;
    }
    await rm(staging, { recursive: true, force: true });
    st.ok(t('meldungen.wiederherstellung.neu-schon-vorhanden', { uebernommen, schonDa }));
  }

  /** Die Schlüsseldatei erst ganz zum Schluss – und bei jedem späteren Fehler wieder zurück. */
  private async legeSchluesselAb(st: WhStand, k: Buffer) {
    st.schritt(t('meldungen.wiederherstellung.schluesseldatei'));
    const datei = this.q.tresor.datei;
    const schluesselText = k.toString('base64url');
    const vorhanden = await readFile(datei, 'utf8').then(
      (t) => t.trim(),
      () => null,
    );
    if (vorhanden !== schluesselText) {
      const alteDatei = vorhanden !== null ? `${datei}.alt-${st.stempel}` : null;
      if (alteDatei) await rename(datei, alteDatei);
      st.schluesselZurueck = async () => {
        await rm(datei, { force: true });
        if (alteDatei) await rename(alteDatei, datei);
      };
      await mkdir(dirname(datei), { recursive: true, mode: 0o700 });
      await writeFile(datei, `${schluesselText}\n`, { mode: 0o600, flag: 'wx' });
      st.ok(
        alteDatei ? t('meldungen.wiederherstellung.ersetzt-die-bisherige-liegt', { pop: String(alteDatei.split('/').pop()) }) : 'angelegt',
      );
    } else st.ok(t('meldungen.wiederherstellung.passt-schon'));
  }

  /** Abschlussmeldung speichern, Schemas tauschen, neu starten. */
  private async schalteUm(st: WhStand, abschluss: Abschluss, ist: Ist, dateien: number) {
    const { lauf, m } = st;
    const neu = st.neu!;
    st.schritt(t('meldungen.wiederherstellung.umschalten'));
    const altSchema = `${st.behalten ? BEHALTEN : ALT}${st.stempel}`;
    if (st.behalten) abschluss.hinweise.push(t('meldungen.wiederherstellung.der-bisherige-stand-liegt', { BEHALTEN_TAGE, altSchema }));
    abschluss.schritte = lauf.schritte.map((s) => ({ ...s, ...(s.name === 'Umschalten' ? { status: 'ok' as const } : {}) }));
    await neu`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${m.haushaltId}, ${'wiederherstellung_abschluss'}, ${neu.json(abschluss as unknown as postgres.JSONValue)})
          ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    await neu.end();
    st.neu = null;
    await this.q.sql.begin(async (tx) => {
      await tx.unsafe(`ALTER SCHEMA public RENAME TO ${bezeichner(altSchema)}`);
      await tx.unsafe(`ALTER SCHEMA ${bezeichner(st.schema)} RENAME TO public`);
    });
    st.schluesselZurueck = null;
    // Anderer Mandant (#119): seine Id gilt ab dem Neustart.
    if (this.q.mandantUebernehmen && m.haushaltId !== (await this.q.laufzeit()).haushaltId) {
      await this.q.mandantUebernehmen(m.haushaltId);
      log.warn('Ablage-Id der Sicherung übernommen', { mandant: m.haushaltId });
    }
    st.ok();
    st.melde(t('meldungen.wiederherstellung.neustart'), 'laeuft', t('meldungen.wiederherstellung.ablago-startet-neu'));
    lauf.status = 'neustart';
    log.warn('Wiederherstellung abgeschlossen, Ablago startet neu', {
      sicherung: lauf.sicherung,
      von: lauf.von,
      mappen: ist.mappen,
      dateien,
    });
    setTimeout(() => this.q.neustart(), 1500).unref?.();
  }

  /** Abbruch: erst aufräumen, dann „fehlgeschlagen“ melden – wer auf das Ende wartet, sieht den alten Stand. */
  private async brichAb(st: WhStand, e: Error) {
    const { lauf, probe, schema } = st;
    const grund = e.message;
    log.error(probe ? 'Probe-Wiederherstellung fehlgeschlagen' : 'Wiederherstellung abgebrochen – der bisherige Stand ist unverändert', {
      sicherung: lauf.sicherung,
      schritt: st.aktuell,
      grund,
    });
    // Erst aufräumen, dann „fehlgeschlagen“ melden: Wer auf das Ende wartet, sieht den alten Stand.
    st.w?.destroy(e);
    await st.neu?.end({ timeout: 5 }).catch(() => {});
    if (st.schluesselZurueck)
      await st.schluesselZurueck().catch((x) => log.error('Bisherige Schlüsseldatei nicht zurückgelegt', { fehler: (x as Error).message }));
    await this.q.sql
      .unsafe(`DROP SCHEMA IF EXISTS ${bezeichner(schema)} CASCADE`)
      .catch((x) => log.warn('Bereich der Wiederherstellung nicht entfernt', { schema, fehler: (x as Error).message }));
    await rm(st.staging, { recursive: true, force: true }).catch(() => {});
    // Scheitert auch das Merken (z. B. Datenbank weg), endet der Lauf trotzdem mit „fehler“ (#1381) – sonst stünde er
    // für immer auf „läuft“ und sperrte jede weitere Sicherung und Wiederherstellung.
    if (probe)
      await this.merkeProbe(lauf.sicherung, false, grund).catch((x) =>
        log.error('Ergebnis der Probe-Wiederherstellung nicht gemerkt', { sicherung: lauf.sicherung, fehler: (x as Error).message }),
      );
    this.fehlschlag(lauf, st.aktuell, grund);
  }
}
