/** Wiederherstellung (#1278 aus wiederherstellung.ts): Grundklasse – Zugang, Abgleich mit der Sicherung, Lauf und Schritte, Ergebnis der Probe. */
import { join } from 'node:path';
import { statfs } from 'node:fs/promises';
import {
  type WiederherstellungsQuellen,
  type Wiederherstellungslauf,
  type Abgleich,
  vergleicheVersion,
  type Schrittstatus,
  log,
} from './wiederherstellung-hilfen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import type { Eintragsliste, SchlankeMetadaten, Metadaten } from './sicherung';
import { WOZU_MAX } from './sicherung-hilfen';
import { schluesselAusText, fingerabdruck, leiteAb } from '../geheimnisse/tresor';
import { liesKopf, liesSicherung, ZWECK } from './sicherungsformat';
import { PLATZ_RESERVE, GB } from '../grundlagen/grenzen';

export abstract class WiederherstellungBasis {
  /** Was die Klasse Wiederherstellung setzt (Felder und Konstruktor, wiederherstellung.ts). */
  protected abstract q: WiederherstellungsQuellen;
  protected abstract lauf: Wiederherstellungslauf | null;
  protected abstract belegt: boolean;
  protected abstract jetzt: () => Date;

  aktuellerLauf(): Wiederherstellungslauf | null {
    return this.lauf ? structuredClone(this.lauf) : null;
  }
  laeuft() {
    return this.belegt || this.lauf?.status === 'laeuft' || this.lauf?.status === 'neustart';
  }

  /** Belegen (synchron, vor jedem await) – sonst könnten zwei Starts gleichzeitig durchrutschen. */
  protected belege() {
    if (this.laeuft() || this.q.sicherung.laeuft()) throw new Fachfehler(409, t('meldungen.wiederherstellung.es-laeuft-bereits-eine'));
    this.belegt = true;
  }

  /** Wer darf? Frisches System: jeder (wie die Ersteinrichtung). Laufendes System: Admin im aktiven Wartungsmodus. */
  async pruefeZugang(admin: boolean, einrichtungscode?: unknown) {
    if (await this.q.einrichtungNoetig()) {
      // Frisches System (#119): nur mit dem Einrichtungscode.
      await this.q.pruefeCode?.(einrichtungscode);
      return 'frisch' as const;
    }
    if (!admin) throw new Fachfehler(403, t('meldungen.wiederherstellung.das-geht-nur-im'));
    if (!this.q.wartungAktiv()) throw new Fachfehler(409, t('meldungen.wiederherstellung.wiederherstellen-geht-nur-im'));
    return 'laufend' as const;
  }

  /* ---------- Abgleich ---------- */

  async abgleich(name: string, schluesselText?: string): Promise<Abgleich> {
    const eintrag = (await this.q.sicherung.liste()).find((x) => x.name === name);
    if (!eintrag) throw new Fachfehler(404, t('meldungen.wiederherstellung.diese-sicherung-gibt-es'));
    const probleme: string[] = [];
    const hinweise: string[] = [];
    // Kopie außer Haus (#585): daneben nur die schlanke Metadaten-Datei – den Rest liest das DMS mit dem Schlüssel aus der Sicherung.
    // Nur die Sicherungsdatei (#1611, z. B. heruntergeladen): Fingerabdruck und Verfahren aus ihrem Kopf, der Rest ebenso.
    const schlank = eintrag.meta ? undefined : (eintrag.schlank ?? (await this.schlankAusKopf(eintrag)));
    const aussen = schlank ? await this.metaAusSicherung({ ...eintrag, schlank }, schluesselText, !eintrag.schlank) : null;
    if (!eintrag.meta && !aussen) throw new Fachfehler(422, t('meldungen.wiederherstellung.zu-dieser-sicherung-fehlt'));
    const m = eintrag.meta ?? aussen!.meta;
    if (aussen) {
      hinweise.push(
        eintrag.schlank
          ? t('meldungen.wiederherstellung.neben-dieser-sicherung-liegt')
          : t('meldungen.wiederherstellung.nur-sicherungsdatei'),
      );
      if (aussen.problem) probleme.push(aussen.problem);
      if (!aussen.gelesen) {
        if (!aussen.problem)
          hinweise.push(t('meldungen.wiederherstellung.gib-den-schluessel-vom', { fingerabdruck: m.verschluesselung.fingerabdruck }));
        return { name, meta: m, vergleich: [], probleme, hinweise, schluesselNoetig: true };
      }
    }
    const heute = await this.q.laufzeit();
    // Die .json liegt unverschlüsselt daneben: was in Pfade einfließt, streng prüfen.
    if (
      m.datei !== `${name}.dms-sicherung` ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.haushaltId ?? '') ||
      !Array.isArray(m.migrationen) ||
      m.migrationen.some((x) => !/^[\w.-]+\.sql$/.test(String(x)))
    ) {
      throw new Fachfehler(422, t('meldungen.wiederherstellung.die-metadaten-datei-json'));
    }
    const vergleich: Abgleich['vergleich'] = [];

    const unbekannt = m.migrationen.filter((x) => !heute.migrationen.includes(x));
    const dms = aussen ? -1 : vergleicheVersion(m.umgebung.dms, heute.dms);
    if (unbekannt.length) {
      probleme.push(
        t('meldungen.wiederherstellung.die-sicherung-stammt-von', {
          anzahl: unbekannt.length,
          dms: m.umgebung.dms,
          datenbankStand: String(m.umgebung.datenbankStand),
          dms2: heute.dms,
        }),
      );
    }
    if (aussen)
      vergleich.push({
        was: 'Ablago',
        damals: 'unbekannt',
        heute: heute.dms,
        urteil: unbekannt.length ? 'fehler' : 'ok',
        info: unbekannt.length ? undefined : t('meldungen.wiederherstellung.steht-nicht-in-der'),
      });
    else
      vergleich.push({
        was: 'Ablago',
        damals: m.umgebung.dms,
        heute: heute.dms,
        urteil: unbekannt.length ? 'fehler' : dms === 0 ? 'gleich' : 'ok',
        info: !unbekannt.length && dms < 0 ? t('meldungen.wiederherstellung.aelter-wird-nach-dem') : undefined,
      });
    const fehlende = heute.migrationen.filter((x) => !m.migrationen.includes(x)).length;
    vergleich.push({
      was: t('meldungen.wiederherstellung.datenbank-stand'),
      damals: m.umgebung.datenbankStand ?? '–',
      heute: heute.migrationen.at(-1) ?? '–',
      urteil: unbekannt.length ? 'fehler' : fehlende ? 'ok' : 'gleich',
      info:
        fehlende && !unbekannt.length
          ? `${fehlende} ${t('meldungen.wiederherstellung.aenderungen-laufen', { anzahl: fehlende })} danach`
          : undefined,
    });
    if (!aussen) {
      const pgDamals = m.umgebung.postgres.split('.')[0];
      const pgHeute = heute.postgres.split('.')[0];
      vergleich.push({
        was: 'PostgreSQL',
        damals: m.umgebung.postgres,
        heute: heute.postgres,
        urteil: pgDamals === pgHeute ? 'gleich' : 'ok',
        info: pgDamals !== pgHeute ? t('meldungen.wiederherstellung.andere-hauptversion-geht-die') : undefined,
      });
      vergleich.push({
        was: 'Architektur',
        damals: m.umgebung.architektur,
        heute: heute.architektur,
        urteil: m.umgebung.architektur === heute.architektur ? 'gleich' : 'ok',
      });
    }
    vergleich.push({
      was: t('meldungen.wiederherstellung.ablage-id'),
      damals: m.haushaltId,
      heute: heute.haushaltId,
      urteil: m.haushaltId === heute.haushaltId ? 'gleich' : 'hinweis',
      info: m.haushaltId !== heute.haushaltId ? t('meldungen.wiederherstellung.abweichend-siehe-hinweis') : undefined,
    });
    if (m.haushaltId !== heute.haushaltId) {
      hinweise.push(
        this.q.mandantUebernehmen
          ? t('meldungen.wiederherstellung.die-sicherung-gehoert-zur', { haushaltId: m.haushaltId, haushaltId2: heute.haushaltId })
          : t('meldungen.wiederherstellung.die-sicherung-gehoert-zur-2', { haushaltId: m.haushaltId, haushaltId2: heute.haushaltId }),
      );
    }

    let schluesselNoetig = !aussen?.mitEingabe && this.q.tresor.fingerabdruck !== m.verschluesselung.fingerabdruck;
    if (schluesselText !== undefined && schluesselText.trim()) {
      const k = schluesselAusText(schluesselText);
      if (!k) probleme.push(t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat'));
      else if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck)
        probleme.push(
          t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat-2', {
            fingerabdruck: fingerabdruck(k),
            fingerabdruck2: m.verschluesselung.fingerabdruck,
          }),
        );
      else schluesselNoetig = false;
    }
    if (schluesselNoetig)
      hinweise.push(
        t('meldungen.wiederherstellung.der-schluessel-dieser-installation', { fingerabdruck: m.verschluesselung.fingerabdruck }),
      );
    try {
      const { kopf } = await liesKopf(join(this.q.sicherung.ordner, m.datei));
      if (kopf.fingerabdruck !== m.verschluesselung.fingerabdruck)
        probleme.push(t('meldungen.wiederherstellung.sicherungsdatei-und-metadaten-passen'));
    } catch (e) {
      probleme.push((e as Error).message);
    }
    return { name, meta: m, vergleich, probleme, hinweise, schluesselNoetig };
  }

  /**
   * Metadaten aus der Sicherung selbst (#585), wenn daneben nur die schlanke Fassung liegt: Mit dem Schlüssel (eingegeben
   * oder der dieses DMS, wenn der Fingerabdruck passt) wird nur der erste Eintrag (Inhaltsangabe) entschlüsselt.
   * Echt ist die Datei erst, wenn beim Einspielen der GCM-Prüfwert am Ende stimmt. Ohne Schlüssel: gelesen = false.
   */
  private async metaAusSicherung(
    e: Eintragsliste & { schlank: SchlankeMetadaten },
    schluesselText?: string,
    nurDatei = false,
  ): Promise<{ meta: Metadaten; gelesen: boolean; mitEingabe: boolean; problem?: string }> {
    const s = e.schlank;
    if (
      s.datei !== `${e.name}.dms-sicherung` ||
      !(nurDatei ? s.sha256 === '' : /^[0-9a-f]{64}$/.test(String(s.sha256))) ||
      typeof s.verschluesselung?.fingerabdruck !== 'string'
    ) {
      throw new Fachfehler(422, t('meldungen.wiederherstellung.die-metadaten-datei-json'));
    }
    const meta: Metadaten = {
      format: 1,
      datei: s.datei,
      haushaltId: '',
      art: 'manuell',
      ausgeloestVon: '–',
      beginn: s.beginn,
      ende: s.beginn,
      dauerSekunden: 0,
      umgebung: { dms: '–', datenbankStand: null, postgres: '–', node: '–', system: '–', architektur: '–' },
      // dateien: -1 = unbekannt (steht erst am Ende der Sicherung); geprüft wird dann gegen den Endeintrag.
      anzahl: { mappen: 0, dokumente: 0, benutzer: 0, dateien: -1, tabellen: 0 } as Metadaten['anzahl'],
      groessen: { datenbankBytes: 0, dateienBytes: e.bytes, sicherungBytes: e.bytes },
      verschluesselung: { verfahren: String(s.verschluesselung.verfahren ?? ''), fingerabdruck: s.verschluesselung.fingerabdruck },
      sha256: s.sha256,
      migrationen: [],
    };
    const text = schluesselText?.trim() ? schluesselText : null;
    const k = text
      ? schluesselAusText(text)
      : this.q.tresor.fingerabdruck === meta.verschluesselung.fingerabdruck
        ? schluesselAusText(this.q.tresor.alsText() ?? '')
        : null;
    if (text && !k)
      return { meta, gelesen: false, mitEingabe: false, problem: t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat') };
    if (!k) return { meta, gelesen: false, mitEingabe: false };
    if (fingerabdruck(k) !== meta.verschluesselung.fingerabdruck)
      return {
        meta,
        gelesen: false,
        mitEingabe: false,
        problem: t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat-2', {
          fingerabdruck: fingerabdruck(k),
          fingerabdruck2: meta.verschluesselung.fingerabdruck,
        }),
      };
    try {
      const it = liesSicherung(join(this.q.sicherung.ordner, s.datei), leiteAb(k, ZWECK))[Symbol.asyncIterator]();
      const erst = await it.next();
      await it.return?.(undefined);
      const kopf = (erst.done ? null : erst.value.art === 'M' ? erst.value.kopf : null) as {
        erstellt?: unknown;
        haushaltId?: unknown;
        migrationen?: unknown;
        tabellen?: unknown;
        ohneInhalt?: unknown;
        zaehler?: Record<string, unknown>;
        wozu?: unknown;
      } | null;
      if (!kopf) throw new Error('Die Sicherung beginnt nicht mit der Inhaltsangabe – die Datei ist beschädigt.');
      const migrationen = Array.isArray(kopf.migrationen) ? kopf.migrationen.map(String) : [];
      const ohne = new Set(Array.isArray(kopf.ohneInhalt) ? kopf.ohneInhalt.map(String) : []);
      const tabellen = Array.isArray(kopf.tabellen)
        ? (kopf.tabellen as Array<{ name?: unknown }>).filter((t) => !ohne.has(String(t?.name))).length
        : 0;
      const z = kopf.zaehler ?? {};
      return {
        meta: {
          ...meta,
          // Nur die Sicherungsdatei (#1611): Beginn aus der Inhaltsangabe.
          ...(!meta.beginn && typeof kopf.erstellt === 'string' ? { beginn: kopf.erstellt, ende: kopf.erstellt } : {}),
          haushaltId: String(kopf.haushaltId ?? ''),
          migrationen,
          // „Wozu?“ (#1529) steht auch verschlüsselt in der Sicherung.
          ...(typeof kopf.wozu === 'string' && kopf.wozu ? { wozu: kopf.wozu.slice(0, WOZU_MAX) } : {}),
          umgebung: { ...meta.umgebung, datenbankStand: migrationen.at(-1) ?? null },
          anzahl: {
            ...meta.anzahl,
            mappen: Number(z.mappen) || 0,
            dokumente: Number(z.dokumente) || 0,
            benutzer: Number(z.benutzer) || 0,
            tabellen,
          } as Metadaten['anzahl'],
        },
        gelesen: true,
        mitEingabe: !!text,
      };
    } catch (x) {
      return {
        meta,
        gelesen: false,
        mitEingabe: false,
        problem: t('meldungen.wiederherstellung.die-sicherung-laesst-sich', { message: (x as Error).message }),
      };
    }
  }

  /**
   * Nur die Sicherungsdatei, ohne `.json` daneben (#1611, z. B. heruntergeladen und auf ein neues Gerät gelegt): schlanke
   * Angaben aus dem unverschlüsselten Kopf der Datei – Verfahren und Fingerabdruck des Schlüssels. Eine Prüfsumme gibt es
   * nicht (leer); ob die Datei echt ist, zeigt der GCM-Prüfwert beim Einspielen. Ist es keine Sicherung: dieser Fehler.
   */
  private async schlankAusKopf(e: Eintragsliste): Promise<SchlankeMetadaten> {
    const datei = `${e.name}.dms-sicherung`;
    const { kopf } = await liesKopf(join(this.q.sicherung.ordner, datei)).catch((x: Error) => {
      throw new Fachfehler(422, x.message);
    });
    return {
      format: kopf.format,
      schlank: true,
      datei,
      groesse: e.bytes,
      sha256: '',
      beginn: '',
      verschluesselung: { verfahren: String(kopf.verfahren ?? ''), fingerabdruck: String(kopf.fingerabdruck ?? '') },
    };
  }

  protected schluessel(m: Metadaten, schluesselText?: string): Buffer {
    const eigen = this.q.tresor.alsText();
    const text = schluesselText?.trim() ? schluesselText : this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? eigen : null;
    const k = text ? schluesselAusText(text) : null;
    if (!k) throw new Fachfehler(422, t('meldungen.wiederherstellung.bitte-den-schluessel-vom'));
    if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck)
      throw new Fachfehler(
        422,
        t('meldungen.wiederherstellung.der-schluessel-passt-nicht', { fingerabdruck: m.verschluesselung.fingerabdruck }),
      );
    return k;
  }

  protected neuerLauf(art: Wiederherstellungslauf['art'], sicherung: string, von: string, schritte: string[]): Wiederherstellungslauf {
    this.lauf = {
      art,
      sicherung,
      von,
      status: 'laeuft',
      schritte: schritte.map((name) => ({ name, status: 'offen' })),
      bytes: 0,
      gesamt: 0,
      gestartet: this.jetzt().toISOString(),
    };
    return this.lauf;
  }

  protected schritt(lauf: Wiederherstellungslauf, name: string, status: Schrittstatus, info?: string) {
    const s = lauf.schritte.find((x) => x.name === name);
    if (s) {
      s.status = status;
      if (info !== undefined) s.info = info;
    }
  }

  protected fehlschlag(lauf: Wiederherstellungslauf, aktuell: string | null, grund: string) {
    if (aktuell) this.schritt(lauf, aktuell, 'fehler', grund);
    for (const s of lauf.schritte)
      if (s.status === 'offen' || s.status === 'laeuft') s.status = s.status === 'laeuft' ? 'fehler' : 'ausgelassen';
    // Zustand als Letztes (#1381, wie #1378): Wer „fehler“ sieht, sieht auch Grund und Ende.
    lauf.fehler = grund;
    lauf.beendet = this.jetzt().toISOString();
    lauf.status = 'fehler';
  }

  protected async pruefePlatz(m: Metadaten) {
    try {
      const f = await statfs(this.q.dateiWurzel);
      const frei = f.bavail * f.bsize;
      if (frei < m.groessen.dateienBytes * 1.05 + PLATZ_RESERVE) {
        throw new Fachfehler(
          507,
          t('meldungen.wiederherstellung.zu-wenig-platz-fuer', {
            replace: (frei / GB).toFixed(1).replace('.', ','),
            replace2: (m.groessen.dateienBytes / GB).toFixed(1).replace('.', ','),
          }),
        );
      }
    } catch (e) {
      if (e instanceof Fachfehler) throw e;
    }
  }

  /* ---------- Probe (#109): Ergebnisse, Zeitplan, Ampel ---------- */

  protected async merkeProbe(name: string, ok: boolean, info: string) {
    const e = this.q.sicherung.einstellungen;
    const alle = ((await e.lies('sicherung_proben')) as Record<string, unknown> | null) ?? {};
    const eintrag = { am: this.jetzt().toISOString(), ok, info: info.slice(0, 1000) };
    await e.schreibe('sicherung_proben', { ...alle, [name]: eintrag });
    await e.schreibe('sicherung_probe_letzte', { name, ...eintrag });
    if (!ok) {
      const vorfall = `probe:${eintrag.am}`;
      if ((await e.lies('sicherung_probe_gemeldet')) !== vorfall) {
        await e.schreibe('sicherung_probe_gemeldet', vorfall);
        try {
          await this.q.anAdmins?.(
            () => t('meldungen.wiederherstellung.ablago-probe-wiederherstellung'),
            () => t('meldungen.wiederherstellung.die-probeweise-wiederherstellung-der', { name, info }),
          );
        } catch (x) {
          log.warn('Mail zur Probe nicht verschickt', { fehler: (x as Error).message });
        }
      }
    }
  }
}
