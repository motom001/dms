/** Sicherung (#1278 aus sicherung.ts): Sicherung anlegen (#103) und aufräumen. */
import { mkdir, statfs, stat, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SicherungBasis } from './sicherung-basis';
import {
  type Metadaten,
  type Sicherungsart,
  type Lauf,
  type Fehlerstand,
  log,
  ortszeit,
  ENDUNG,
  dateienUnter,
  behalten,
  ZU_ALT_TAGE,
  TAG_MS,
  fehlgrundVon,
  vermerkeFehlschlag,
  bereinigeWozu,
} from './sicherung-hilfen';
import { ZWECK, type Eintrag, schreibeSicherung } from './sicherungsformat';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { GB, MB } from '../grundlagen/grenzen';

/** Zusätze einer Sicherung: „Wozu?“ (#1529, nur von Hand) und „nachgeholt“ (#1531, nur automatisch). */
export interface Zusaetze {
  wozu?: unknown;
  nachgeholt?: boolean;
}
/** Zahl in GB mit Komma (für Meldungen). */
const gb = (b: number) => (b / GB).toFixed(1).replace('.', ',');
import { OHNE_INHALT } from './datenbankabzug';
import { FASSUNG_PFAD } from '../dateien/dateiumwandlung';
import { ARCHIV_PFAD } from '../dateien/archivfassung';
import { oeffneStrom } from '../dateien/dateispeicher';

export abstract class SicherungAnlegen extends SicherungBasis {
  /** Steht weiter oben in der Kette (sicherung-extern.ts). */
  protected abstract kuendigeAn(name: string, meta: Metadaten): Promise<void>;

  /* ---------- Sicherung anlegen (#103) ---------- */

  /**
   * Startet eine Sicherung im Hintergrund. `warten` liefert eine Promise, die mit dem Ende des
   * Laufs erfüllt wird (für die automatische Sicherung und Tests).
   */
  async starte(art: Sicherungsart, von: string, zusaetze: Zusaetze = {}): Promise<{ lauf: Lauf; fertig: Promise<Metadaten | null> }> {
    const wozu = art === 'manuell' ? bereinigeWozu(zusaetze.wozu) : null;
    let schluessel = this.q.tresor.abgeleitet(ZWECK);
    // Mehrere Prozesse (#1419): Hat ein anderer Prozess den Schlüssel eben erst erzeugt, kennt dieser ihn erst nach dem
    // nächsten Abgleich (bis zu 2 s). Vor dem Ablehnen darum einmal nachlesen – sonst scheitert „Sicherung jetzt“ direkt
    // nach „Schlüssel erzeugen“, je nachdem, welcher Prozess die Anfrage bekommt.
    if (!schluessel && this.q.tresor.nachladen) {
      await this.q.tresor.nachladen();
      schluessel = this.q.tresor.abgeleitet(ZWECK);
    }
    if (!schluessel || !this.q.tresor.fingerabdruck) {
      await vermerkeFehlschlag({ art, ort: 'lokal', grund: 'schluessel' });
      throw new Fachfehler(409, t('meldungen.sicherung.ohne-schluessel-keine-sicherung'));
    }
    const plan = await this.plan();
    await mkdir(this.ordner, { recursive: true }).catch(async (e: unknown) => {
      await vermerkeFehlschlag({ art, ort: 'lokal', grund: fehlgrundVon(e) });
      throw e;
    });
    try {
      const f = await statfs(this.ordner);
      const frei = f.bavail * f.bsize;
      // #1509 (Sicherheit): Reicht der Platz voraussichtlich nicht, lieber auslassen und melden als die Platte füllen.
      const geschaetzt = frei < plan.mindestFreiGB * GB ? 0 : await this.geschaetzteGroesse();
      if (frei < plan.mindestFreiGB * GB || frei - geschaetzt < plan.mindestFreiGB * GB) {
        const grund =
          frei < plan.mindestFreiGB * GB
            ? t('meldungen.sicherung.zu-wenig-freier-speicherplatz', { replace: gb(frei), mindestFreiGB: plan.mindestFreiGB })
            : t('meldungen.sicherung.platz-reicht-voraussichtlich-nicht', {
                frei: gb(frei),
                geschaetzt: gb(geschaetzt),
                mindestFreiGB: plan.mindestFreiGB,
              });
        await this.merkeFehler(art, grund);
        await vermerkeFehlschlag({ art, ort: 'lokal', grund: 'platz' });
        throw new Fachfehler(507, grund);
      }
    } catch (e) {
      if (e instanceof Fachfehler) throw e;
    }
    const lauf = this.belege(
      'sicherung',
      art === 'automatisch'
        ? t('meldungen.sicherung.automatische-sicherung')
        : art === 'vor-wiederherstellung'
          ? t('meldungen.sicherung.sicherung-vor-der-wiederherstellung')
          : 'Sicherung',
    );
    const fertig = this.fuehreAus(lauf, art, von, schluessel, { ...(wozu ? { wozu } : {}), nachgeholt: zusaetze.nachgeholt === true });
    return { lauf, fertig };
  }

  private async merkeFehler(art: Sicherungsart, grund: string) {
    const f: Fehlerstand = { am: this.jetzt().toISOString(), art, grund };
    await this.q.einstellungen.schreibe('sicherung_fehler', f);
    log.error('Sicherung fehlgeschlagen', { art, grund });
  }

  private async freierName(art: Sicherungsart): Promise<string> {
    const o = ortszeit(this.jetzt());
    const basis = `${o.datum}_${o.uhr.replace(':', '')}-${art}`;
    for (let i = 1; ; i++) {
      const name = i === 1 ? basis : `${basis}-${i}`;
      if (!(await stat(join(this.ordner, `${name}${ENDUNG}`)).catch(() => null))) return name;
    }
  }

  /**
   * Erst ankündigen und aufräumen, dann melden (#1378, wie #1373): Der Lauf wechselt genau einmal von „läuft“ auf
   * „fertig“ oder „fehler“ – erst, wenn Ankündigung außer Haus und Aufbewahrung durch sind. Scheitert eine dieser
   * Nacharbeiten, endet er wie bisher mit „fehler“ (Mail, Hinweis), obwohl die neue Sicherung selbst vollständig ist.
   * Ab `belege()` steht er auf „läuft“ – darum liegt alles danach im `try`, auch die Suche nach dem freien Namen.
   */
  private async fuehreAus(
    lauf: Lauf,
    art: Sicherungsart,
    von: string,
    schluessel: Buffer,
    zusatz: { wozu?: string; nachgeholt: boolean },
  ): Promise<Metadaten | null> {
    const beginn = this.jetzt();
    const vorlaeufig: string[] = [];
    let fertig: Metadaten | null = null;
    /** Liegt die Sicherung schon fertig im Ordner? Scheitert danach nur eine Nacharbeit, fehlt keine Sicherung (#1308). */
    let abgelegt = false;
    try {
      const name = await this.freierName(art);
      const teil = join(this.ordner, `.${name}${ENDUNG}.teil`);
      vorlaeufig.push(teil, join(this.ordner, `.${name}.json.teil`));
      const fingerabdruck = this.q.tresor.fingerabdruck!;
      log.info('Sicherung begonnen', {
        name,
        art,
        von,
        ...(zusatz.wozu ? { wozu: zusatz.wozu } : {}),
        ...(zusatz.nachgeholt ? { nachgeholt: true } : {}),
      });
      const umgebung = await this.q.umgebung();
      let dateienBytes = 0;
      let dateien = 0;
      let fassungen = 0;
      let archivfassungen = 0;
      let datenbankBytes = 0;
      for await (const f of dateienUnter(this.dateiOrdner)) dateienBytes += f.groesse;
      lauf.gesamt = dateienBytes + (await this.q.daten.groesse().catch(() => 0));
      const ergebnis = await this.q.daten.imSchnappschuss(async (s) => {
        const tabellen = s.tabellen.filter((t) => !OHNE_INHALT.has(t.name));
        const ordner = this.dateiOrdner;
        const haushaltId = this.haushaltId;
        const wozu = zusatz.wozu;
        async function* eintraege(): AsyncGenerator<Eintrag> {
          yield {
            art: 'M',
            kopf: {
              format: 1,
              haushaltId,
              erstellt: beginn.toISOString(),
              migrationen: s.migrationen,
              tabellen: s.tabellen,
              ohneInhalt: [...OHNE_INHALT],
              zaehler: s.zaehler,
              // „Wozu?“ (#1529) auch verschlüsselt in der Sicherung: Mit nur der schlanken Angabe vom Ziel bleibt er lesbar.
              ...(wozu ? { wozu } : {}),
            },
          };
          for (const t of tabellen) {
            lauf.schritt = `Datenbank: ${t.name}`;
            const quelle = await s.inhalt(t);
            yield {
              art: 'T',
              kopf: { tabelle: t.name, spalten: t.spalten },
              daten: (async function* () {
                for await (const c of quelle) {
                  datenbankBytes += c.length;
                  yield c;
                }
              })(),
            };
          }
          lauf.schritt = 'Dateien';
          // Mit den Dateien: Designs und die umgewandelten Fassungen von Paketen (#577) mit ihren Angaben.
          for await (const f of dateienUnter(ordner)) {
            dateien++;
            if (f.pfad.endsWith('.fassung') && FASSUNG_PFAD.test(f.pfad)) fassungen++;
            if (f.pfad.endsWith('.fassung') && ARCHIV_PFAD.test(f.pfad)) archivfassungen++;
            yield { art: 'D', kopf: { pfad: f.pfad, groesse: f.groesse }, daten: (await oeffneStrom(f.voll)) as AsyncIterable<Buffer> };
          }
          yield { art: 'E', kopf: { tabellen: tabellen.length, dateien } };
        }
        const g = await schreibeSicherung(teil, schluessel, fingerabdruck, eintraege(), (n) => {
          lauf.bytes = n;
        });
        return { g, s: { postgres: s.postgres, migrationen: s.migrationen, zaehler: s.zaehler, tabellen: tabellen.length } };
      });
      lauf.schritt = 'Abschließen';
      const ende = this.jetzt();
      const meta: Metadaten = {
        format: 1,
        datei: `${name}${ENDUNG}`,
        haushaltId: this.haushaltId,
        umgebung: { ...umgebung, datenbankStand: ergebnis.s.migrationen.at(-1) ?? null, postgres: ergebnis.s.postgres },
        art,
        ausgeloestVon: von,
        beginn: beginn.toISOString(),
        ende: ende.toISOString(),
        dauerSekunden: Math.round((ende.getTime() - beginn.getTime()) / 1000),
        anzahl: { ...ergebnis.s.zaehler, dateien, tabellen: ergebnis.s.tabellen, fassungen, archivfassungen },
        groessen: { datenbankBytes, dateienBytes, sicherungBytes: ergebnis.g.bytes },
        verschluesselung: { verfahren: t('meldungen.sicherung.aes-256-gcm-schluessel'), fingerabdruck },
        sha256: ergebnis.g.sha256,
        migrationen: ergebnis.s.migrationen,
        ...(zusatz.wozu ? { wozu: zusatz.wozu } : {}),
        ...(zusatz.nachgeholt ? { nachgeholt: true } : {}),
      };
      await writeFile(join(this.ordner, `.${name}.json.teil`), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
      await rename(teil, join(this.ordner, `${name}${ENDUNG}`));
      await rename(join(this.ordner, `.${name}.json.teil`), join(this.ordner, `${name}.json`));
      abgelegt = true;
      // Danach im Hintergrund außer Haus (#585): Die lokale Sicherung ist fertig, egal was dort geschieht.
      await this.kuendigeAn(name, meta);
      if (art === 'automatisch') await this.raeumeAuf();
      fertig = meta;
      log.info('Sicherung fertig', {
        name,
        art,
        mappen: meta.anzahl.mappen,
        dokumente: meta.anzahl.dokumente,
        dateien,
        mb: Math.round(ergebnis.g.bytes / MB),
        sekunden: meta.dauerSekunden,
      });
    } catch (e) {
      for (const pfad of vorlaeufig) await rm(pfad, { force: true }).catch(() => {});
      lauf.fehler = (e as Error).message;
      await this.merkeFehler(art, (e as Error).message).catch(() => {});
      // Ins Nachweis-Journal nur der feste Grund – der Fehlertext kann Pfade enthalten (#1308).
      if (!abgelegt) await vermerkeFehlschlag({ art, ort: 'lokal', grund: fehlgrundVon(e) });
    }
    lauf.beendet = this.jetzt().toISOString();
    lauf.schritt = fertig ? 'Fertig' : 'Abgebrochen';
    if (fertig) lauf.ergebnis = fertig;
    lauf.status = fertig ? 'fertig' : 'fehler';
    return fertig;
  }

  /**
   * Aufbewahrung (#104): ältere automatische Sicherungen entfernen – bzw. alle außer der neuesten (#585, „lokal nur
   * die neueste“). Eine Sicherung, deren Kopie außer Haus noch läuft, bleibt bis zu 2 Tage stehen (#585).
   */
  async raeumeAuf(): Promise<string[]> {
    const plan = await this.plan();
    const liste = await this.liste();
    const auto = liste.filter((x) => x.meta?.art === 'automatisch').map((x) => ({ name: x.name, beginn: x.meta!.beginn }));
    // #1194: ohne Kopie außer Haus, die zuletzt erfolgreich lief, gilt die normale Aufbewahrung.
    const nurNeueste = plan.nurNeueste && (await this.nurNeuesteMoeglich(liste));
    if (plan.nurNeueste && !nurNeueste)
      log.warn('„Lokal nur die neueste“ wirkt nicht: keine erfolgreiche Kopie außer Haus – es gilt die normale Aufbewahrung');
    const bleibt = nurNeueste
      ? new Set(
          [...auto]
            .sort((x, y) => y.beginn.localeCompare(x.beginn))
            .slice(0, 1)
            .map((x) => x.name),
        )
      : behalten(auto, plan.aufbewahrung);
    const jetzt = this.jetzt().getTime();
    const unterwegs = (n: string) =>
      Object.values(liste.find((x) => x.name === n)?.extern ?? {}).some(
        (s) => (s.status === 'offen' || s.status === 'laeuft') && jetzt - Date.parse(s.seit) < ZU_ALT_TAGE * TAG_MS,
      );
    const weg = auto.filter((x) => !bleibt.has(x.name) && !unterwegs(x.name)).map((x) => x.name);
    if (weg.length)
      await this.entfernt
        .merke(weg, await this.externStaende())
        .catch((e) => log.warn('Entfernte Sicherungen nicht gemerkt', { fehler: (e as Error).message }));
    for (const n of weg) {
      await rm(join(this.ordner, `${n}${ENDUNG}`), { force: true });
      await rm(join(this.ordner, `${n}.json`), { force: true });
    }
    await this.vergissExtern(weg);
    if (weg.length) log.info('Ältere automatische Sicherungen entfernt (Aufbewahrung)', { anzahl: weg.length, namen: weg });
    return weg;
  }
}
