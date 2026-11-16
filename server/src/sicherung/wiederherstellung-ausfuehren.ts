/** Wiederherstellung (#1278 aus wiederherstellung.ts): der eigentliche Lauf – einspielen, prüfen, umschalten oder aufräumen. */
import { randomBytes, createHash } from 'node:crypto';
import { join, dirname, sep } from 'node:path';
import postgres from 'postgres';
import type { Writable } from 'node:stream';
import { stat, readFile, mkdir, rm, readdir, rename, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { WiederherstellungBasis } from './wiederherstellung-basis';
import {
  type Wiederherstellungslauf,
  type Abgleich,
  STAGING,
  BEHALTEN_TAGE,
  istSicherer,
  log,
  ERWEITERUNGEN_SCHRITT,
  type Abschluss,
  BEHALTEN,
  ALT,
} from './wiederherstellung-hilfen';
import { t } from '../sprache/sprache';
import { sha256Von, liesSicherung, ZWECK } from './sicherungsformat';
import { bezeichner, type Tabelle, OHNE_INHALT } from './datenbankabzug';
import { leiteAb, istPruefwort, entschluesseleMit } from '../geheimnisse/tresor';
import { FASSUNG_PFAD } from '../dateien/dateiumwandlung';
import { ARCHIV_PFAD, WOERTER_PFAD } from '../dateien/archivfassung';
import { STATISTIK_SPALTEN } from '../repo/pg';
import { migriere } from '../datenbank/db';
import { liesErweiterungen, trigrammIndizes, problemeAus, beschreibe, TRIGRAMM_INDEXNAMEN } from '../datenbank/erweiterungen';

export abstract class WiederherstellungAusfuehren extends WiederherstellungBasis {
  /** Der eigentliche Ablauf. Bei Probe: nie umschalten, immer aufräumen. */
  protected async fuehreAus(lauf: Wiederherstellungslauf, a: Abgleich, k: Buffer, art: 'frisch' | 'laufend' | 'probe'): Promise<boolean> {
    const m = a.meta;
    const stempel = `${this.jetzt().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
    const schema = `${STAGING}${stempel}`;
    const staging = join(this.q.dateiWurzel, `.wiederherstellung-${stempel}`);
    const probe = art === 'probe';
    let neu: postgres.Sql | null = null;
    let w: Writable | null = null;
    let schluesselZurueck: (() => Promise<void>) | null = null;
    let behalten = false;
    let aktuell: string | null = null;
    const schritt = (name: string) => {
      aktuell = name;
      this.schritt(lauf, name, 'laeuft');
    };
    const ok = (info?: string) => {
      if (aktuell) this.schritt(lauf, aktuell, 'ok', info);
    };
    try {
      if (art === 'laufend' && !this.q.tresor.alsText()) {
        // Ohne (passenden) Schlüssel lässt sich der jetzige Stand nicht sichern – z. B. wenn er verloren ist.
        // Dann bleibt das alte Schema nach dem Umschalten noch eine Weile in der Datenbank.
        behalten = true;
        this.schritt(
          lauf,
          t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'),
          'hinweis',
          t('meldungen.wiederherstellung.nicht-moeglich-diese-installation', { BEHALTEN_TAGE }),
        );
      } else if (art === 'laufend') {
        schritt(t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'));
        const { fertig } = await this.q.sicherung.starte('vor-wiederherstellung', lauf.von);
        const vorher = await fertig;
        if (!vorher)
          throw new Error(
            `Die Sicherung des jetzigen Stands ist fehlgeschlagen: ${this.q.sicherung.aktuellerLauf()?.fehler ?? 'unbekannt'}. Ohne sie wird nichts ersetzt.`,
          );
        ok(vorher.datei);
      }

      schritt(t('meldungen.wiederherstellung.pruefsumme-der-datei'));
      const pfad = join(this.q.sicherung.ordner, m.datei);
      lauf.gesamt = (await stat(pfad)).size;
      const sha = await sha256Von(pfad, (n) => {
        lauf.bytes = n;
      });
      if (sha !== m.sha256)
        throw new Error(
          'Die Prüfsumme der Sicherungsdatei stimmt nicht mit den Metadaten überein – die Datei ist verändert oder beschädigt.',
        );
      ok('unverändert');

      schritt(t('meldungen.wiederherstellung.entschluesseln-und-einspielen'));
      await this.q.sql.unsafe(`CREATE SCHEMA ${bezeichner(schema)}`);
      neu = postgres(this.q.url, { max: 1, onnotice: () => {}, infer: true, connection: { search_path: schema } });
      await neu.unsafe(`SET search_path TO ${bezeichner(schema)}`);
      // Schema auf den Stand der Sicherung bringen: genau ihre Migrationen.
      await neu.begin(async (tx) => {
        await tx`CREATE TABLE schema_migrationen (name text PRIMARY KEY, ausgefuehrt timestamptz NOT NULL DEFAULT now())`;
        for (const datei of m.migrationen) {
          await tx.unsafe(await readFile(join(this.q.migrationen, datei), 'utf8'));
          await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
        }
      });
      // Was die Migrationen selbst angelegt haben (z. B. den Mandanten), kommt aus der Sicherung.
      const leeren = (await neu`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> 'schema_migrationen'`).map(
        (r) => bezeichner(r.tablename as string),
      );
      if (leeren.length) await neu.unsafe(`TRUNCATE ${leeren.join(', ')} CASCADE`);
      if (!probe) await mkdir(staging, { recursive: true });
      let tabellen = 0;
      let dateien = 0;
      let stichprobe = 0;
      let iDatei = 0;
      let endeTabellen: number | null = null;
      let dateienEnde: number | null = null;
      // Ohne Anzahl (schlanke Metadaten, #585) jede Datei prüfen.
      const jede = Math.max(1, Math.ceil(m.anzahl.dateien / 20));
      let zaehlerSicherung: Record<string, number> | null = null;
      // Umgewandelte Fassungen (#577, seit 0.140.1 in der Sicherung): Prüfwert des Inhalts und der in den Angaben.
      const fassungIst = new Map<string, string>();
      const fassungSoll = new Map<string, string>();
      // Archivfassungen (#631): ebenso; Angaben „imOriginal“ (das Original ist schon PDF/A) haben keinen eigenen Inhalt.
      const archivIst = new Map<string, string>();
      const archivSoll = new Map<string, string>();
      const archivOriginal = new Set<string>();
      lauf.bytes = 0;
      for await (const e of liesSicherung(pfad, leiteAb(k, ZWECK), (n) => {
        lauf.bytes = n;
      })) {
        if (e.art === 'M') {
          if (e.kopf.haushaltId !== m.haushaltId) throw new Error('Inhalt und Metadaten der Sicherung passen nicht zusammen (Ablage-Id).');
          zaehlerSicherung = (e.kopf.zaehler as Record<string, number>) ?? null;
        } else if (e.art === 'T') {
          const tabelle2 = { name: String(e.kopf.tabelle), spalten: (e.kopf.spalten as string[]).map(String) } as Tabelle;
          if (OHNE_INHALT.has(tabelle2.name)) {
            for await (const _ of e.daten) {
              /* übergehen */
            }
            continue;
          }
          this.schritt(
            lauf,
            t('meldungen.wiederherstellung.entschluesseln-und-einspielen'),
            'laeuft',
            t('meldungen.wiederherstellung.tabelle', { name: tabelle2.name }),
          );
          w = await neu
            .unsafe(`COPY ${bezeichner(schema)}.${bezeichner(tabelle2.name)} (${tabelle2.spalten.map(bezeichner).join(', ')}) FROM STDIN`)
            .writable();
          for await (const c of e.daten) if (!w.write(c)) await once(w, 'drain');
          w.end();
          await once(w, 'finish');
          w = null;
          tabellen++;
        } else if (e.art === 'D') {
          const rel = String(e.kopf.pfad);
          if (!istSicherer(rel)) throw new Error(`Ungültiger Dateipfad in der Sicherung: ${rel}`);
          const pruefen = iDatei++ % jede === 0;
          const name = rel.split('/').pop()!;
          const fassung = FASSUNG_PFAD.exec(rel) ?? ARCHIV_PFAD.exec(rel);
          const istArchiv = !!fassung && rel.startsWith('archivfassungen/');
          const h = pruefen && /^[0-9a-f]{64}$/.test(name) ? createHash('sha256') : null;
          // Fassungen und Archivfassungen immer ganz prüfen: Inhalt gegen den Prüfwert in ihren Angaben (.json).
          const hf = fassung?.[2] === 'fassung' ? createHash('sha256') : null;
          const angaben: Buffer[] | null = fassung?.[2] === 'json' ? [] : null;
          // Streamen statt puffern: auch große Dokumente brauchen kaum Arbeitsspeicher.
          let ausgabe: Writable | null = null;
          if (!probe) {
            const ziel = join(staging, m.haushaltId, ...rel.split('/'));
            await mkdir(dirname(ziel), { recursive: true });
            ausgabe = createWriteStream(ziel, { flags: 'wx', flush: true });
            w = ausgabe;
          }
          for await (const c of e.daten) {
            h?.update(c);
            hf?.update(c);
            if (angaben && angaben.length < 64) angaben.push(c);
            if (ausgabe && !ausgabe.write(c)) await once(ausgabe, 'drain');
          }
          if (ausgabe) {
            ausgabe.end();
            await once(ausgabe, 'close');
            w = null;
          }
          if (h) {
            if (h.digest('hex') !== name) throw new Error(`Die Datei ${rel} in der Sicherung ist beschädigt (Prüfwert stimmt nicht).`);
            stichprobe++;
          }
          if (hf) (istArchiv ? archivIst : fassungIst).set(fassung![1], hf.digest('hex'));
          if (angaben) {
            let soll = '';
            let imOriginal = false;
            try {
              const j = JSON.parse(Buffer.concat(angaben).toString('utf8')) as { sha256?: unknown; imOriginal?: unknown };
              soll = String(j.sha256 ?? '');
              imOriginal = j.imOriginal === true;
            } catch {
              /* unlesbar */
            }
            (istArchiv ? archivSoll : fassungSoll).set(fassung![1], soll);
            if (istArchiv && imOriginal) archivOriginal.add(fassung![1]);
          }
          dateien++;
        } else if (e.art === 'E') {
          endeTabellen = Number(e.kopf.tabellen);
          dateienEnde = Number(e.kopf.dateien);
        }
      }
      // Erst hier ist der GCM-Prüfwert geprüft: Die Datei ist echt und vollständig.
      if (endeTabellen === null || tabellen !== endeTabellen || tabellen !== m.anzahl.tabellen)
        throw new Error(`Die Sicherung ist unvollständig: ${tabellen} Tabellen eingespielt, erwartet ${m.anzahl.tabellen}.`);
      // Fassung und Angaben gehören zusammen. Passt ein Paar nicht (z. B. während der Sicherung neu umgewandelt), kommt
      // es nicht mit: Das Paket wandelt die Datei dann neu um (wie bei einer Sicherung ohne Fassungen).
      let fassungen = 0;
      let fassungenOhne = 0;
      for (const sha of new Set([...fassungIst.keys(), ...fassungSoll.keys()])) {
        if (fassungIst.has(sha) && fassungIst.get(sha) === fassungSoll.get(sha)) {
          fassungen++;
          continue;
        }
        fassungenOhne++;
        log.warn('Umgewandelte Fassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
        if (!probe)
          for (const endung of ['json', 'fassung'])
            await rm(join(staging, m.haushaltId, 'fassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
      }
      let archiv = 0;
      let archivOhne = 0;
      for (const sha of new Set([...archivIst.keys(), ...archivSoll.keys()])) {
        // „Original ist schon PDF/A“: nur Angaben, ihr Prüfwert ist der des Originals.
        if (archivOriginal.has(sha) && !archivIst.has(sha) && archivSoll.get(sha) === sha) {
          archiv++;
          continue;
        }
        if (archivIst.has(sha) && archivIst.get(sha) === archivSoll.get(sha)) {
          archiv++;
          continue;
        }
        archivOhne++;
        log.warn('Archivfassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
        if (!probe)
          for (const endung of ['json', 'fassung'])
            await rm(join(staging, m.haushaltId, 'archivfassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
      }
      ok(
        t('meldungen.wiederherstellung.tabellen-dateien', {
          tabellen,
          dateien,
          wert: fassungen ? t('meldungen.wiederherstellung.umgewandelte-fassungen', { anzahl: fassungen }) : '',
          wert2: fassungenOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen', { fassungenOhne }) : '',
          wert3: archiv ? t('meldungen.wiederherstellung.archivfassungen-pdf-a', { anzahl: archiv }) : '',
          wert4: archivOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen-2', { archivOhne }) : '',
          wert5: stichprobe ? t('meldungen.wiederherstellung.pruefwerte-von-dateien-nachgerechnet', { stichprobe }) : '',
        }),
      );
      // Zähler der Sequenzen nachziehen.
      for (const r of await neu`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_default LIKE 'nextval(%'`) {
        const t = `${bezeichner(schema)}.${bezeichner(r.table_name as string)}`;
        await neu.unsafe(
          `SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${String(r.column_name).replace(/'/g, "''")}'), coalesce((SELECT max(${bezeichner(r.column_name as string)}) FROM ${t}), 0) + 1, false)`,
        );
      }
      // Statistik der eingespielten Tabellen (#367): COPY füllt sie, ANALYZE erst macht sie dem Planer bekannt.
      try {
        for (const r of await neu`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'`) {
          const spalten = STATISTIK_SPALTEN[r.table_name as string];
          await neu.unsafe(`ANALYZE ${bezeichner(schema)}.${bezeichner(r.table_name as string)}${spalten ? ` (${spalten})` : ''}`);
        }
      } catch {
        /* nur Leistung: der Autovacuum-Dienst holt es später nach */
      }

      schritt(t('meldungen.wiederherstellung.pruefwort'));
      const [pw] = await neu`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort' LIMIT 1`;
      if (!pw)
        this.schritt(
          lauf,
          t('meldungen.wiederherstellung.pruefwort'),
          'hinweis',
          t('meldungen.wiederherstellung.die-sicherung-enthaelt-noch'),
        );
      else if (!istPruefwort(entschluesseleMit(k, String(pw.wert))))
        throw new Error('Das Prüfwort lässt sich mit diesem Schlüssel nicht lesen – der Schlüssel passt nicht zu den Daten.');
      else ok(t('meldungen.wiederherstellung.mit-dem-schluessel-lesbar'));

      schritt(t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'));
      const n = async (t: string) =>
        Number((await neu!.unsafe(`SELECT count(*)::int AS n FROM ${bezeichner(schema)}.${bezeichner(t)}`))[0].n);
      const ist = { mappen: await n('mappen'), dokumente: await n('dokumente'), benutzer: await n('benutzer') };
      const soll = zaehlerSicherung ?? m.anzahl;
      const abw = (['mappen', 'dokumente', 'benutzer'] as const).filter((x) => ist[x] !== Number(soll[x]));
      if (abw.length) throw new Error(`Die Anzahl stimmt nicht: ${abw.map((x) => `${x} ${ist[x]} statt ${soll[x]}`).join(', ')}.`);
      // Kopie außer Haus mit schlanken Metadaten (#585): Anzahl aus dem Endeintrag der Sicherung (dateienEnde).
      const dateienSoll = m.anzahl.dateien >= 0 ? m.anzahl.dateien : dateienEnde;
      if (dateienSoll !== dateien) throw new Error(`Die Anzahl der Dateien stimmt nicht: ${dateien} statt ${dateienSoll ?? 'unbekannt'}.`);
      ok(
        t('meldungen.wiederherstellung.mappen-dokumente-benutzer', {
          mappen: ist.mappen,
          dokumente: ist.dokumente,
          benutzer: ist.benutzer,
        }),
      );

      schritt(t('meldungen.wiederherstellung.auf-den-heutigen-stand'));
      const vorher = m.migrationen.length;
      await migriere(neu, this.q.migrationen, () => {});
      const nachher = Number((await neu`SELECT count(*)::int AS n FROM schema_migrationen`)[0].n);
      ok(
        nachher > vorher
          ? t('meldungen.wiederherstellung.aenderungen-ausgefuehrt', { wert: nachher - vorher })
          : t('meldungen.wiederherstellung.schon-aktuell'),
      );
      // Automatisierungen (#674): nach einer Wiederherstellung vorhanden, aber angehalten, bis ein Admin sie einschaltet.
      if (!probe)
        await neu`UPDATE automatisierungen SET angehalten = ${neu.json({ grund: 'wiederherstellung', text: 'Angehalten nach einer Wiederherstellung. Prüfe die Automatisierung und schalte sie wieder ein.', zeit: new Date().toISOString() })}
        WHERE aktiv AND angehalten IS NULL`;

      // Erweiterungen (#562): Fehlt pg_trgm oder unaccent, läuft die Suche nach dem Umschalten schlechter – das soll
      // vorher sichtbar sein, nicht still passieren. Die Daten sind trotzdem vollständig, daher nur ein Hinweis.
      schritt(ERWEITERUNGEN_SCHRITT);
      const erweiterungen = await liesErweiterungen(this.q.sql);
      const mitTrgm = erweiterungen.some((e) => e.name === 'pg_trgm' && e.zustand !== 'fehlt');
      const indizes = mitTrgm ? await trigrammIndizes(neu, schema) : [];
      const fehlt = [
        ...problemeAus(erweiterungen).map(beschreibe),
        ...(mitTrgm
          ? TRIGRAMM_INDEXNAMEN.filter((n) => !indizes.includes(n)).map((n) => t('meldungen.wiederherstellung.trigramm-index-fehlt', { n }))
          : []),
      ];
      if (fehlt.length) {
        const text = `${fehlt.join('; ')}. Die Daten sind vollständig; Abhilfe steht unter Werkbank → Systemzustand.`;
        this.schritt(lauf, ERWEITERUNGEN_SCHRITT, 'hinweis', text);
        a.hinweise.push(t('meldungen.wiederherstellung.erweiterungen-der-datenbank-2', { text }));
        log.warn('Erweiterungen der Datenbank unvollständig', { probe, fehlt: fehlt.join('; ') });
      } else ok(t('meldungen.wiederherstellung.pg-trgm-und-unaccent'));

      if (probe) {
        schritt(t('meldungen.wiederherstellung.aufraeumen'));
        await neu.end();
        neu = null;
        await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(schema)} CASCADE`);
        ok();
        lauf.status = 'fertig';
        lauf.beendet = this.jetzt().toISOString();
        await this.merkeProbe(lauf.sicherung, true, lauf.schritte.map((s) => `${s.name}: ${s.info ?? s.status}`).join('; '));
        log.info('Probe-Wiederherstellung erfolgreich', { sicherung: lauf.sicherung, mappen: ist.mappen, dateien });
        return true;
      }

      // Abschlussmeldung und Ende des Wartungsmodus stehen schon in der neuen Datenbank.
      const hinweise = [...a.hinweise.filter((h) => !/Notfallblatt ein/.test(h))];
      const abschluss: Abschluss = { am: this.jetzt().toISOString(), sicherung: lauf.sicherung, von: lauf.von, schritte: [], hinweise };
      const setze = async (k2: string, w: unknown) => {
        await neu!`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${m.haushaltId}, ${k2}, ${neu!.json(w as postgres.JSONValue)})
          ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
      };
      await neu`DELETE FROM einstellungen WHERE schluessel = 'wartung'`;
      // Ereignisse (#670) aus der Zeit vor der Sicherung nicht noch einmal verteilen.
      const [{ da }] = await neu<{ da: string | null }[]>`SELECT to_regclass('ereignisse')::text AS da`;
      if (da) await neu`UPDATE ereignisse SET verteilt = now() WHERE verteilt IS NULL`;

      schritt(t('meldungen.wiederherstellung.dateien-uebernehmen'));
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
      ok(t('meldungen.wiederherstellung.neu-schon-vorhanden', { uebernommen, schonDa }));

      // Die Schlüsseldatei erst ganz zum Schluss – und bei jedem späteren Fehler wieder zurück.
      schritt(t('meldungen.wiederherstellung.schluesseldatei'));
      const datei = this.q.tresor.datei;
      const schluesselText = k.toString('base64url');
      const vorhanden = await readFile(datei, 'utf8').then(
        (t) => t.trim(),
        () => null,
      );
      if (vorhanden !== schluesselText) {
        const alteDatei = vorhanden !== null ? `${datei}.alt-${stempel}` : null;
        if (alteDatei) await rename(datei, alteDatei);
        schluesselZurueck = async () => {
          await rm(datei, { force: true });
          if (alteDatei) await rename(alteDatei, datei);
        };
        await mkdir(dirname(datei), { recursive: true, mode: 0o700 });
        await writeFile(datei, `${schluesselText}\n`, { mode: 0o600, flag: 'wx' });
        ok(
          alteDatei
            ? t('meldungen.wiederherstellung.ersetzt-die-bisherige-liegt', { pop: String(alteDatei.split('/').pop()) })
            : 'angelegt',
        );
      } else ok(t('meldungen.wiederherstellung.passt-schon'));

      schritt(t('meldungen.wiederherstellung.umschalten'));
      const altSchema = `${behalten ? BEHALTEN : ALT}${stempel}`;
      if (behalten) abschluss.hinweise.push(t('meldungen.wiederherstellung.der-bisherige-stand-liegt', { BEHALTEN_TAGE, altSchema }));
      abschluss.schritte = lauf.schritte.map((s) => ({ ...s, ...(s.name === 'Umschalten' ? { status: 'ok' as const } : {}) }));
      await setze('wiederherstellung_abschluss', abschluss);
      await neu.end();
      neu = null;
      await this.q.sql.begin(async (tx) => {
        await tx.unsafe(`ALTER SCHEMA public RENAME TO ${bezeichner(altSchema)}`);
        await tx.unsafe(`ALTER SCHEMA ${bezeichner(schema)} RENAME TO public`);
      });
      schluesselZurueck = null;
      // Anderer Mandant (#119): seine Id gilt ab dem Neustart.
      if (this.q.mandantUebernehmen && m.haushaltId !== (await this.q.laufzeit()).haushaltId) {
        await this.q.mandantUebernehmen(m.haushaltId);
        log.warn('Ablage-Id der Sicherung übernommen', { mandant: m.haushaltId });
      }
      ok();
      this.schritt(lauf, t('meldungen.wiederherstellung.neustart'), 'laeuft', t('meldungen.wiederherstellung.ablago-startet-neu'));
      lauf.status = 'neustart';
      log.warn('Wiederherstellung abgeschlossen, Ablago startet neu', {
        sicherung: lauf.sicherung,
        von: lauf.von,
        mappen: ist.mappen,
        dateien,
      });
      setTimeout(() => this.q.neustart(), 1500).unref?.();
      return true;
    } catch (e) {
      const grund = (e as Error).message;
      log.error(probe ? 'Probe-Wiederherstellung fehlgeschlagen' : 'Wiederherstellung abgebrochen – der bisherige Stand ist unverändert', {
        sicherung: lauf.sicherung,
        schritt: aktuell,
        grund,
      });
      // Erst aufräumen, dann „fehlgeschlagen“ melden: Wer auf das Ende wartet, sieht den alten Stand.
      w?.destroy(e as Error);
      await neu?.end({ timeout: 5 }).catch(() => {});
      if (schluesselZurueck)
        await schluesselZurueck().catch((x) => log.error('Bisherige Schlüsseldatei nicht zurückgelegt', { fehler: (x as Error).message }));
      await this.q.sql
        .unsafe(`DROP SCHEMA IF EXISTS ${bezeichner(schema)} CASCADE`)
        .catch((x) => log.warn('Bereich der Wiederherstellung nicht entfernt', { schema, fehler: (x as Error).message }));
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (probe) await this.merkeProbe(lauf.sicherung, false, grund);
      this.fehlschlag(lauf, aktuell, grund);
      return false;
    }
  }
}
