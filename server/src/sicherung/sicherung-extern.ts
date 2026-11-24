/** Sicherung (#1278 aus sicherung.ts): Sicherung außer Haus (#585), Zustand und Hinweise (#105). */
import { stat, readFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { SicherungAnlegen } from './sicherung-anlegen';
import {
  type ExternAnbindung,
  type ExternStand,
  type Sicherungsziel,
  type Metadaten,
  schlankeMetadaten,
  log,
  type SchlankeMetadaten,
  istSchlank,
  type ExternStatus,
  EXTERN_STATUS,
  type ExternPruefung,
  EXTERN_PRUEFUNG,
  ohneZugangsdaten,
  erfolgreich,
  type Eintragsliste,
  ZU_ALT_TAGE,
  TAG_MS,
  type Fehlerstand,
  type Probeergebnis,
  type ProbePlan,
  PROBE_TAGE,
  artAusName,
  vermerkeFehlschlag,
  liesErste,
} from './sicherung-hilfen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { STUECK_MAX } from '../grundlagen/grenzen';
import type { EreignisAufruf } from '../volltext';
import { gebietsschema } from '../../../shared/src/sprache';
import { zeitzone } from '../../../shared/src/region';

export abstract class SicherungExtern extends SicherungAnlegen {
  /** Was die Klasse Sicherung setzt (Felder, sicherung.ts). */
  abstract extern: ExternAnbindung | null;
  protected abstract externKette: Promise<unknown>;

  /* ---------- Sicherung außer Haus (#585) ---------- */

  protected async externStaende(): Promise<Record<string, Record<string, ExternStand>>> {
    const v = await this.q.einstellungen.lies('sicherung_extern');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Record<string, ExternStand>>) : {};
  }
  private aendereExtern(f: (alle: Record<string, Record<string, ExternStand>>) => boolean): Promise<void> {
    const weiter = this.externKette.then(async () => {
      const alle = await this.externStaende();
      if (f(alle)) await this.q.einstellungen.schreibe('sicherung_extern', Object.keys(alle).length ? alle : null);
    });
    this.externKette = weiter.catch(() => {});
    return weiter;
  }

  private setzeExtern(name: string, paket: string, stand: ExternStand) {
    return this.aendereExtern((alle) => {
      alle[name] = { ...(alle[name] ?? {}), [paket]: stand };
      return true;
    });
  }

  protected vergissExtern(namen: string[]) {
    return this.aendereExtern((alle) => {
      const da = namen.filter((n) => n in alle);
      for (const n of da) delete alle[n];
      return da.length > 0;
    });
  }

  /** Ziele außer Haus: Pakete mit dms:sicherung-lesen, mit Adresse und dem zuletzt gemeldeten Ziel. */
  async externZiele(): Promise<Sicherungsziel[]> {
    const pakete = (await this.extern?.pakete().catch(() => [])) ?? [];
    if (!pakete.length) return [];
    const alle = await this.externStaende();
    const zuletzt = (id: string) =>
      Object.values(alle)
        .map((x) => x[id])
        .filter((s): s is ExternStand => !!s?.ziel)
        .sort((a, b) => b.am.localeCompare(a.am))[0]?.ziel ?? null;
    return pakete.map((p) => ({ ...p, ziel: zuletzt(p.id) }));
  }

  /**
   * Kopie außer Haus gescheitert (#1308): ins Nachweis-Journal mit dem Namen des Pakets als Ziel – nicht mit der Angabe
   * des Pakets zum Ziel und nicht mit seinem Fehlertext (beides kann Adressen oder Pfade enthalten).
   */
  private async vermerkeExtern(name: string, paket: string, vorher: ExternStand, status: ExternStatus) {
    // Nur der Wechsel nach „fehlgeschlagen“ zählt: fehlgeschlagen und danach aufgegeben ist ein Fehlschlag, nicht zwei.
    if (status !== 'fehlgeschlagen' || vorher.status === 'fehlgeschlagen') return;
    const pakete = (await this.extern?.pakete().catch(() => [])) ?? [];
    const ziel = pakete.find((p) => p.id === paket)?.name ?? paket;
    await vermerkeFehlschlag({ art: artAusName(name), ort: 'ausser_haus', ziel, grund: 'ziel' });
  }

  /** Nach einer Sicherung: Ereignis an die Pakete, Stand „offen“ je Paket. Fehler hier stören die Sicherung nicht. */
  protected async kuendigeAn(name: string, meta: Metadaten) {
    try {
      const pakete = (await this.extern?.pakete()) ?? [];
      if (!pakete.length) return;
      const am = this.jetzt().toISOString();
      await this.aendereExtern((alle) => {
        alle[name] = Object.fromEntries(pakete.map((p) => [p.id, { status: 'offen', seit: am, am } satisfies ExternStand]));
        return true;
      });
      await this.extern!.melde({ name, ...schlankeMetadaten(meta) });
    } catch (e) {
      log.error('Kopie außer Haus nicht angestoßen', { name, fehler: (e as Error).message });
      await vermerkeFehlschlag({ art: meta.art, ort: 'ausser_haus', grund: 'fehler' });
    }
  }

  /** Darf das Paket diese Sicherung lesen? Nur die, die ihm mit sicherung.fertig gemeldet wurde – sonst 403/404. */
  private async externZugang(paket: string, name: string): Promise<{ pfad: string; groesse: number; stand: ExternStand }> {
    const pfad = this.pfad(name);
    const s = await stat(pfad).catch(() => null);
    if (!s?.isFile()) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es-2'));
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand) throw new Fachfehler(403, t('meldungen.sicherung.diese-sicherung-wurde-dem'));
    return { pfad, groesse: s.size, stand };
  }

  /** Schlanke Metadaten einer gemeldeten Sicherung (GET /sicherungen/{name}). */
  async externMeta(paket: string, name: string): Promise<SchlankeMetadaten & { name: string }> {
    await this.externZugang(paket, name);
    const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => 'null')) as unknown;
    if (!j) throw new Fachfehler(404, t('meldungen.sicherung.zu-dieser-sicherung-fehlen'));
    return { name, ...(istSchlank(j) ? j : schlankeMetadaten(j as Metadaten)) };
  }

  /** Ein Stück der verschlüsselten Datei (GET /sicherungen/{name}/datei): ab versatz höchstens laenge Bytes. */
  async externStueck(paket: string, name: string, versatz: unknown, laenge: unknown): Promise<{ inhalt: Buffer; groesse: number }> {
    const { pfad, groesse } = await this.externZugang(paket, name);
    const zahl = (v: unknown, std: number) => (v === undefined || v === '' ? std : Number(v));
    const ab = zahl(versatz, 0),
      n = zahl(laenge, STUECK_MAX);
    if (!Number.isSafeInteger(ab) || ab < 0 || ab > groesse)
      throw new Fachfehler(422, t('meldungen.sicherung.versatz-0-bis-groesse', { groesse }));
    if (!Number.isSafeInteger(n) || n < 1 || n > STUECK_MAX)
      throw new Fachfehler(422, t('meldungen.sicherung.laenge-1-bis-bytes', { STUECK_MAX }));
    const inhalt = Buffer.alloc(Math.min(n, groesse - ab));
    const f = await open(pfad, 'r');
    try {
      const { bytesRead } = await f.read(inhalt, 0, inhalt.length, ab);
      return { inhalt: inhalt.subarray(0, bytesRead), groesse };
    } finally {
      await f.close();
    }
  }

  /** Rückmeldung des Pakets je Sicherung (PUT /sicherungen/{name}/extern). */
  async externRueckmeldung(paket: string, name: string, e: unknown): Promise<ExternStand> {
    const { stand } = await this.externZugang(paket, name);
    const x = (e ?? {}) as Record<string, unknown>;
    const status = x.status as ExternStatus;
    if (!EXTERN_STATUS.includes(status)) throw new Fachfehler(422, `status: ${EXTERN_STATUS.join(', ')}.`);
    const pruefung = x.pruefung === undefined || x.pruefung === null ? undefined : (x.pruefung as ExternPruefung);
    if (pruefung !== undefined && !EXTERN_PRUEFUNG.includes(pruefung))
      throw new Fachfehler(422, `pruefung: ${EXTERN_PRUEFUNG.join(', ')}.`);
    if (status === 'geprueft' && pruefung !== 'pruefsumme' && pruefung !== 'stichprobe')
      throw new Fachfehler(422, t('meldungen.sicherung.geprueft-braucht-pruefung-pruefsumme'));
    if (status === 'hochgeladen' && (pruefung === 'pruefsumme' || pruefung === 'stichprobe'))
      throw new Fachfehler(422, t('meldungen.sicherung.mit-pruefsumme-oder-stichprobe'));
    const text = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? ohneZugangsdaten(v.trim().replace(/\s+/g, ' ')).slice(0, max) : undefined;
    const grund = text(x.grund, 500);
    if (status === 'fehlgeschlagen' && !grund) throw new Fachfehler(422, t('meldungen.sicherung.bei-fehlgeschlagen-bitte-einen'));
    const zahl = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined);
    const neu: ExternStand = {
      status,
      ...(pruefung ? { pruefung } : {}),
      ...(grund ? { grund } : {}),
      ...(status === 'fehlgeschlagen' && x.endgueltig === true ? { endgueltig: true } : {}),
      ...((text(x.ziel, 200) ?? stand.ziel) ? { ziel: text(x.ziel, 200) ?? stand.ziel } : {}),
      ...(zahl(x.bytes) !== undefined ? { bytes: zahl(x.bytes) } : {}),
      ...(zahl(x.gesamt) !== undefined ? { gesamt: zahl(x.gesamt) } : {}),
      seit: stand.seit,
      am: this.jetzt().toISOString(),
    };
    await this.setzeExtern(name, paket, neu);
    await this.vermerkeExtern(name, paket, stand, status);
    if (status === 'fehlgeschlagen') log.warn('Kopie außer Haus fehlgeschlagen', { name, paket, grund, endgueltig: !!neu.endgueltig });
    else if (status !== 'laeuft')
      log.info(status === 'geprueft' ? 'Kopie außer Haus geprüft' : 'Kopie außer Haus hochgeladen', {
        name,
        paket,
        pruefung: pruefung ?? null,
        ziel: neu.ziel ?? null,
      });
    if (status === 'fehlgeschlagen' && neu.endgueltig) void this.melde().catch(() => {});
    return neu;
  }

  /**
   * Antwort des Pakets auf einen Aufruf von sicherung.fertig (#636) – so meldet es seinen Stand, ohne schreiben zu dürfen:
   * als „extern“ im JSON-Ergebnis (auch neben „weiter“), dieselben Felder wie bei PUT /sicherungen/{name}/extern.
   * Ohne „extern“ zählt der Rückgabewert: 2 → „fehlgeschlagen“ (endgültig – hier muss jemand handeln), sonst ≠ 0 →
   * „läuft“ mit der Meldung als Grund; der Läufer wiederholt. Erfolg ohne „extern“ ändert nichts.
   */
  async externAntwort(paket: string, name: string, r: EreignisAufruf): Promise<void> {
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand) return;
    let extern: unknown;
    if (r.text.trimStart().startsWith('{')) {
      try {
        extern = (JSON.parse(r.text) as Record<string, unknown> | null)?.extern;
      } catch {
        /* kein JSON: Text */
      }
    }
    if (extern !== undefined) {
      await this.externRueckmeldung(paket, name, extern).catch((f) =>
        log.warn('Kopie außer Haus: Rückmeldung des Pakets nicht übernommen', { name, paket, fehler: (f as Error).message }),
      );
      return;
    }
    // Erfolg ohne Stand; schon erfolgreich; oder während des Aufrufs schon gemeldet (Pakete vor #636, PUT): nichts ändern.
    if (r.ok || erfolgreich(stand) || Date.parse(stand.am) >= r.beginn) return;
    const endgueltig = r.rc === 2;
    const status: ExternStatus = endgueltig ? 'fehlgeschlagen' : 'laeuft';
    const grund =
      ohneZugangsdaten((r.fehler ?? '').trim().replace(/\s+/g, ' ')).slice(0, 500) || t('meldungen.sicherung.das-paket-meldet-einen');
    await this.setzeExtern(name, paket, {
      status,
      grund,
      ...(endgueltig ? { endgueltig: true } : {}),
      ...(stand.ziel ? { ziel: stand.ziel } : {}),
      ...(stand.bytes !== undefined ? { bytes: stand.bytes } : {}),
      ...(stand.gesamt !== undefined ? { gesamt: stand.gesamt } : {}),
      seit: stand.seit,
      am: this.jetzt().toISOString(),
    });
    await this.vermerkeExtern(name, paket, stand, status);
    log.warn(endgueltig ? 'Kopie außer Haus fehlgeschlagen' : 'Kopie außer Haus: Versuch fehlgeschlagen', {
      name,
      paket,
      grund,
      endgueltig,
    });
    if (endgueltig) void this.melde().catch(() => {});
  }

  /** Das Paket hat das Ereignis aufgegeben (alle Wiederholungen fehlgeschlagen): „fehlgeschlagen“, endgültig. */
  async externAufgegeben(paket: string, name: string, fehler: string | null | undefined) {
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand || erfolgreich(stand)) return;
    await this.setzeExtern(name, paket, {
      ...stand,
      status: 'fehlgeschlagen',
      endgueltig: true,
      grund: t('meldungen.sicherung.nach-mehreren-versuchen-aufgegeben', {
        ohneZugangsdaten: ohneZugangsdaten(
          stand.status === 'fehlgeschlagen' && stand.grund ? stand.grund : (fehler ?? t('meldungen.sicherung.unbekannter-fehler')),
        ).slice(0, 450),
      }),
      am: this.jetzt().toISOString(),
    });
    await this.vermerkeExtern(name, paket, stand, 'fehlgeschlagen');
    log.error('Kopie außer Haus aufgegeben', { name, paket, fehler });
    void this.melde().catch(() => {});
  }

  /**
   * Zustand außer Haus: letzte erfolgreiche Kopie, aktueller Fehler, „hinkt mehr als 2 Tage hinterher“. Es zählen nur
   * Pakete, die noch installiert sind. zuAlt: Eine Sicherung, die älter als 2 Tage ist und neuer als die letzte
   * erfolgreiche Kopie, ist noch nicht außer Haus.
   */
  async externZustand(liste?: Eintragsliste[]) {
    const ziele = await this.externZiele();
    if (!ziele.length) return null;
    const ids = new Set(ziele.map((z) => z.id));
    const jetzt = this.jetzt().getTime();
    let letzte: { name: string; paket: string; beginn: string; stand: ExternStand } | null = null;
    let fehler: { name: string; paket: string; beginn: string; stand: ExternStand } | null = null;
    let aeltesteOffen: string | null = null;
    for (const e of liste ?? (await this.liste())) {
      const st = Object.entries(e.extern ?? {}).filter(([p]) => ids.has(p));
      if (!st.length) continue;
      const beginn = e.meta?.beginn ?? e.schlank?.beginn ?? st[0][1].seit;
      const ok = st.find(([, s]) => erfolgreich(s));
      if (ok) {
        letzte = { name: e.name, paket: ok[0], beginn, stand: ok[1] };
        break;
      }
      const f = st.find(([, s]) => s.status === 'fehlgeschlagen');
      if (f && !fehler) fehler = { name: e.name, paket: f[0], beginn, stand: f[1] };
      aeltesteOffen = e.meta?.ende ?? st[0][1].seit;
    }
    // Lokal schon weggeräumt (#1327): Die Kopie außer Haus gibt es trotzdem – sie steht in der Merkliste (#976).
    const weg = await this.entfernt.letzteKopie(ids).catch(() => null);
    const neueste = weg && (!letzte || weg.beginn > letzte.beginn) ? weg : letzte;
    return { ziele, letzte: neueste, fehler, zuAlt: !!aeltesteOffen && jetzt - Date.parse(aeltesteOffen) > ZU_ALT_TAGE * TAG_MS };
  }

  /**
   * Darf „lokal nur die neueste“ wirken (#1194)? Nur mit einem Ziel außer Haus, dessen letzte Kopie erfolgreich war –
   * ohne Fehler danach und ohne mehr als 2 Tage Rückstand. Sonst bliebe genau eine Sicherung, ohne Weg zurück.
   */
  async nurNeuesteMoeglich(liste?: Eintragsliste[], extern?: Awaited<ReturnType<SicherungExtern['externZustand']>>): Promise<boolean> {
    const x = extern !== undefined ? extern : await this.externZustand(liste).catch(() => null);
    if (!x?.ziele.length || x.fehler || x.zuAlt) return false;
    // Die letzte erfolgreiche Kopie kann lokal schon weggeräumt sein – auch dann steht sie in `letzte` (#976, #1327).
    return !!x.letzte;
  }

  /* ---------- Zustand und Hinweise (#105) ---------- */

  async zustand() {
    const liste = await this.liste();
    const extern = await this.externZustand(liste).catch(() => null);
    const letzte = liste.find((x) => x.meta)?.meta ?? null;
    const fehler = (await this.q.einstellungen.lies('sicherung_fehler')) as Fehlerstand | null;
    const jetzt = this.jetzt().getTime();
    const plan = await this.plan();
    const grenze = ZU_ALT_TAGE * TAG_MS;
    const moeglich = await this.nurNeuesteMoeglich(liste, extern);
    return {
      letzte: letzte ? { name: letzte.datei, ende: letzte.ende, art: letzte.art } : null,
      fehler: fehler && (!letzte || fehler.am > letzte.ende) ? fehler : null,
      /** Letzte erfolgreiche älter als 2 Tage – oder noch keine, obwohl der Zeitplan seit 2 Tagen an ist. */
      zuAlt: letzte
        ? jetzt - Date.parse(letzte.ende) > grenze
        : !!(plan.aktiv && plan.aktivSeit && jetzt - Date.parse(plan.aktivSeit) > grenze),
      planAktiv: plan.aktiv,
      notfallblatt: await this.notfallblatt(),
      schluessel: this.q.tresor.bereit,
      /** Fingerabdruck des aktuellen Schlüssels: Sicherungen mit anderem brauchen ein älteres Notfallblatt (#47). */
      fingerabdruck: this.q.tresor.fingerabdruck,
      ort: this.ort(),
      probe: await this.probeAmpel(letzte !== null),
      extern,
      /** „Lokal nur die neueste“ (#1194): wählbar, und ob es gerade wirkt. */
      nurNeueste: { gesetzt: plan.nurNeueste, moeglich, wirksam: plan.nurNeueste && moeglich },
      /** Erste Sicherung samt Probe nach der Einrichtung (#1509); null bei älteren Installationen. */
      erste: await liesErste(this),
    };
  }

  /** Ampel der Probe-Wiederherstellung (#109): grün ≤ 8 Tage erfolgreich, gelb älter oder nie, rot fehlgeschlagen. */
  async probeAmpel(
    gibtSicherungen: boolean,
  ): Promise<{ ampel: 'gruen' | 'gelb' | 'rot' | null; letzte: (Probeergebnis & { name: string }) | null; plan: ProbePlan }> {
    const letzte = (await this.q.einstellungen.lies('sicherung_probe_letzte')) as (Probeergebnis & { name: string }) | null;
    const plan = await this.probePlan();
    if (!gibtSicherungen && !letzte) return { ampel: null, letzte: null, plan };
    const ampel = !letzte
      ? 'gelb'
      : !letzte.ok
        ? 'rot'
        : this.jetzt().getTime() - Date.parse(letzte.am) > PROBE_TAGE * TAG_MS
          ? 'gelb'
          : 'gruen';
    return { ampel, letzte, plan };
  }

  /** Einmal je Vorfall eine Mail an alle Administratoren (#105). */
  async melde(): Promise<string | null> {
    const z = await this.zustand();
    let vorfall: string | null = null;
    let betreff = '';
    let text = '';
    if (z.fehler) {
      vorfall = `fehler:${z.fehler.am}`;
      betreff = t('meldungen.sicherung.ablago-sicherung-fehlgeschlagen');
      text = t('meldungen.sicherung.die-sicherung-am-ist', {
        wert: z.fehler.art === 'automatisch' ? 'automatische ' : '',
        wert2: new Date(z.fehler.am).toLocaleString(gebietsschema(), { timeZone: zeitzone() }),
        grund: z.fehler.grund,
      });
    } else if (z.planAktiv && z.zuAlt) {
      vorfall = `alt:${z.letzte?.ende ?? 'nie'}`;
      betreff = t('meldungen.sicherung.ablago-die-letzte-sicherung');
      text = z.letzte
        ? t('meldungen.sicherung.die-letzte-erfolgreiche-sicherung', {
            wert: new Date(z.letzte.ende).toLocaleString(gebietsschema(), { timeZone: zeitzone() }),
            ZU_ALT_TAGE,
          })
        : t('meldungen.sicherung.es-gibt-noch-keine');
    }
    if (vorfall) return this.meldeVorfall('sicherung_gemeldet', vorfall, betreff, text);
    return this.meldeExtern(z.extern);
  }

  /** Kopie außer Haus (#585): endgültig fehlgeschlagen oder mehr als 2 Tage im Rückstand – einmal je Vorfall. Nennt nur das Ziel. */
  private async meldeExtern(x: Awaited<ReturnType<SicherungExtern['externZustand']>>): Promise<string | null> {
    if (!x) return null;
    const zielText = (id: string) => {
      const z = x.ziele.find((y) => y.id === id);
      return z ? `${z.name}${z.adresse ? ` (${ohneZugangsdaten(z.adresse)})` : z.ziel ? ` (${z.ziel})` : ''}` : id;
    };
    const wann = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { timeZone: zeitzone() });
    if (x.fehler?.stand.endgueltig) {
      return this.meldeVorfall(
        'sicherung_extern_gemeldet',
        `extern-fehler:${x.fehler.name}:${x.fehler.paket}`,
        t('meldungen.sicherung.ablago-kopie-ausser-haus'),
        t('meldungen.sicherung.die-sicherung-vom-liess', {
          wann: wann(x.fehler.beginn),
          zielText: zielText(x.fehler.paket),
          wert: x.fehler.stand.grund ?? 'unbekannt',
        }),
      );
    }
    if (x.zuAlt) {
      return this.meldeVorfall(
        'sicherung_extern_gemeldet',
        `extern-alt:${x.letzte?.name ?? 'nie'}`,
        t('meldungen.sicherung.ablago-die-letzte-kopie'),
        t('meldungen.sicherung.neuere-sicherungen-sind-seit', {
          wert: x.letzte
            ? t('meldungen.sicherung.die-letzte-kopie-ausser', { wann: wann(x.letzte.beginn) })
            : t('meldungen.sicherung.es-gibt-noch-keine-2'),
          ZU_ALT_TAGE,
          map: x.ziele.map((z) => zielText(z.id)).join(', '),
          wert2: x.fehler?.stand.grund ? t('meldungen.sicherung.letzter-fehler', { grund: x.fehler.stand.grund }) : '',
        }),
      );
    }
    return null;
  }

  private async meldeVorfall(schluessel: string, vorfall: string, betreff: string, text: string): Promise<string | null> {
    if ((await this.q.einstellungen.lies(schluessel)) === vorfall) return null;
    await this.q.einstellungen.schreibe(schluessel, vorfall);
    log.warn(betreff.replace('Ablago: ', ''), { vorfall });
    try {
      await this.q.anAdmins?.(betreff, () => t('meldungen.sicherung.details-stehen-in-der', { text }));
    } catch (e) {
      log.warn('Mail zur Sicherung nicht verschickt', { fehler: (e as Error).message });
    }
    return vorfall;
  }
}
