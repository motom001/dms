/**
 * Zeitplan (#674, #1278 Teil von `Automatisierungen`): „Datum in N Tagen“, neue Version, Wenn-Karte „Zeitplan“.
 */
import { createHash } from 'node:crypto';
import { AutomatisierungWiederholen } from './wiederholen';
import { heuteIn } from '../../../../shared/src/sichten';
import { UHR_FORMAT, type WennDatum, uuidAus, tageBis, type WennZeitplan } from './hilfen';
import {
  automatisierungsProbleme,
  ausloeserSchluessel,
  AUTOMATISIERUNG_GRENZEN,
  erreichteDaten,
  type Automatisierung,
} from '../../../../shared/src/automatisierung';
import { log, HAENGT_MIN } from './gemeinsam';
import { faelligeTage, type Merker, laufeFaellige, wochentagVon, zeitpunktIn } from '../../zeitplan/zeitplan';
import { eigeneVersion } from '../../system/system';
import { liesRegion } from '../../../../shared/src/region';
import { istBundesland, feiertagAm } from '../../../../shared/src/feiertage';
import { wirksameZeit } from '../../aufgaben/aufgabenmail';

/** Zeitplan und Merker. */
export abstract class AutomatisierungZeitplan extends AutomatisierungWiederholen {
  private zeitplanLauf: Promise<void> | null = null;
  /** Merker für den Zeitplan, wenn es keinen Einstellungsspeicher gibt (Tests). */
  private merkerOhneSpeicher = new Map<string, string>();

  /* ---------- Zeitplan „Datum in N Tagen“ ---------- */

  /** Prüft fällige Tage (auch verpasste) und räumt auf. Mehrere Server: je Mappe und Tag genau ein Lauf (eindeutig). */
  async zeitplan(): Promise<void> {
    if (this.zeitplanLauf) return this.zeitplanLauf;
    this.zeitplanLauf = (async () => {
      if (this.d.pause?.()) return;
      const jetzt = new Date(this.jetzt());
      const heute = heuteIn(jetzt);
      const uhrzeit = UHR_FORMAT().format(jetzt);
      // Bearbeiten geht vor Automatisierung: Was nicht mehr passt, wird rot und angehalten (mit Grund).
      const k = await this.kontext();
      for (const a of await this.d.repo.liste()) {
        if (!a.aktiv || a.angehalten) continue;
        const p = automatisierungsProbleme(a, k);
        if (p.length) {
          await this.d.repo.setze(a.id, { angehalten: { grund: 'fehlerhaft', text: p.join(' '), zeit: this.iso() } });
          log.warn('Automatisierung angehalten (passt nicht mehr)', { id: a.id, name: a.name, grund: p[0] });
        }
      }
      const alle = (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'datum');
      // Gleiche Auslöser (Typ, Feld, Vorlauf) gemeinsam: Reihenfolge und „Danach keine weiteren …“ gelten auch hier.
      const gruppen = new Map<string, typeof alle>();
      for (const a of alle) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
      const ort = { datum: heute, uhr: uhrzeit };
      for (const liste of gruppen.values()) {
        for (const a of liste) {
          const w = a.wenn as Extract<WennDatum, { art: 'datum' }>;
          // Zeitplan-Baustein (#724): eine Regel zum Nachholen; neu eingeschaltet ab heute (nichts rückwirkend).
          for (const tag of faelligeTage(a.letzterTag, ort, { uhrzeit: w.uhrzeit, nachholenTage: AUTOMATISIERUNG_GRENZEN.nachholenTage })) {
            for (const ziel of erreichteDaten(tag, w.vorlauf, w.einheit)) {
              for (const mappe of await this.d.dienst.automatisierungshilfen.mappenMitDatum(w.typ, w.feld, ziel)) {
                const ereignis = uuidAus(`datum|${ausloeserSchluessel(w)}|${mappe}|${ziel}`);
                // Alle der Gruppe für diese Mappe und diesen Tag (die eigene Reihenfolge entscheidet).
                await this.reihe(
                  liste.filter((x) => x.id === a.id || (x.letzterTag ? x.letzterTag < tag : tag === heute)),
                  {
                    id: ereignis,
                    art: 'datum',
                    daten: { mappe, typ: w.typ, feld: w.feld, datum: ziel, tage: tageBis(ziel, tag) },
                    kette: 0,
                  },
                );
              }
            }
            for (const x of liste) await this.d.repo.setze(x.id, { letzterTag: tag });
            for (const x of liste) x.letzterTag = tag;
          }
        }
      }
      await this.zeitplanKarten(ort);
      await this.versionPruefen(ort);
      await this.d.repo.raeumeAuf(AUTOMATISIERUNG_GRENZEN.verlaufTage, AUTOMATISIERUNG_GRENZEN.verlauf, HAENGT_MIN);
    })().finally(() => {
      this.zeitplanLauf = null;
    });
    return this.zeitplanLauf;
  }

  /**
   * Wenn-Karte „Zeitplan“ (#678) über den Zeitplan-Baustein (#724): je Automatisierung – bzw. je Automatisierung und
   * Benutzer bei „für jeden Benutzer“ – ein Merker in den Einstellungen; verpasste Läufe holt er nur am selben Tag nach
   * (wie die Tägliche Zusammenfassung). Mehrere Server: Wer den Tag im Merker einträgt, macht den Lauf; dazu je Lauf eine
   * feste Ereignis-Id (genau einmal).
   */
  /** Merker in den Einstellungen (mehrere Server: wer den Tag einträgt, macht den Lauf); ohne Speicher im Arbeitsspeicher. */
  private merker(schluessel: string): Merker {
    const einst = this.d.dienst.kern.einstellungen;
    if (einst)
      return {
        lies: async () => {
          const v = await einst.lies(schluessel);
          return typeof v === 'string' ? v : null;
        },
        beanspruche: async (alt, tag) => {
          if (einst.tausche) return einst.tausche(schluessel, alt, tag);
          if (((await einst.lies(schluessel)) ?? null) !== alt) return false;
          await einst.schreibe(schluessel, tag);
          return true;
        },
      };
    return {
      lies: async () => this.merkerOhneSpeicher.get(schluessel) ?? null,
      beanspruche: async (alt, tag) => {
        if ((this.merkerOhneSpeicher.get(schluessel) ?? null) !== alt) return false;
        this.merkerOhneSpeicher.set(schluessel, tag);
        return true;
      },
    };
  }

  /**
   * Wenn-Karte „Neue Version verfügbar“ (#677): einmal am Tag (ab 06:00, verpasst am selben Tag nachgeholt) fragen –
   * nur, solange eine solche Automatisierung an ist. Je Version genau ein Ereignis (Merker `automatisierung_version`).
   */
  private async versionPruefen(ort: { datum: string; uhr: string }) {
    const w = this.d.werkbank;
    if (!w || !(await this.d.repo.liste()).some((a) => a.aktiv && !a.angehalten && a.wenn.art === 'version.neu')) return;
    await laufeFaellige(this.merker('automatisierung_version_geprueft'), ort, { uhrzeit: '06:00', an: () => true }, async () => {
      const neu = await w.neueVersion().catch((x: Error) => {
        log.info('Neue Version nicht geprüft', { fehler: x.message });
        return null;
      });
      if (!neu) return;
      const gemeldet = this.merker('automatisierung_version');
      const alt = await gemeldet.lies();
      if (alt === neu || !(await gemeldet.beanspruche(alt, neu))) return;
      await this.d.dienst.kern.ereignis('version.neu', { version: neu, installiert: eigeneVersion() }, null);
    });
  }

  private async zeitplanKarten(ort: { datum: string; uhr: string }) {
    const alle = (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'zeitplan');
    if (!alle.length) return;
    const einst = this.d.dienst.kern.einstellungen;
    // Feiertage nach Werkbank → Region (#726; bis dahin stand das Bundesland bei der Täglichen Zusammenfassung).
    const roh = ((await einst?.lies('aufgaben_mail')) ?? {}) as { bundesland?: unknown };
    const region = einst ? liesRegion(await einst.lies('region'), roh.bundesland) : null;
    const bundesland = region ? region.bundesland : istBundesland(roh.bundesland) ? roh.bundesland : null;
    const merker = (schluessel: string) => this.merker(schluessel);
    const takt = (uhrzeit: string, tage: number[], feiertage: boolean) => ({
      uhrzeit,
      an: (tag: string) => tage.includes(wochentagVon(tag)) && !(feiertage && feiertagAm(tag, bundesland)),
    });
    // Gleiche Auslöser gemeinsam (Reihenfolge, „Danach keine weiteren …“) – je Benutzer bzw. je Tag ein Ereignis.
    const gruppen = new Map<string, Automatisierung[]>();
    for (const a of alle) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
    const k = await this.kontext();
    for (const [schluessel, liste] of gruppen) {
      const w = liste[0].wenn as WennZeitplan;
      const sk = createHash('sha256').update(schluessel).digest('hex').slice(0, 16);
      if (!w.jeBenutzer) {
        await laufeFaellige(merker(`zeitplan_zuletzt:${sk}`), ort, takt(w.uhrzeit, w.tage, w.feiertage), async (tag) => {
          // zeitpunkt (#1082): der geplante Zeitpunkt, für „Paket nach Zeitplan ausführen“.
          await this.reihe(liste, {
            id: uuidAus(`zeitplan|${schluessel}|${tag}`),
            art: 'zeitplan',
            daten: { tag, zeitpunkt: zeitpunktIn(tag, w.uhrzeit) },
            kette: 0,
          });
        });
        continue;
      }
      const wer = w.rolle ? new Set(await this.d.dienst.automatisierungshilfen.mitgliederDerRolle(w.rolle)) : null;
      for (const b of k.benutzer) {
        if (b.aktiv === false || (wer && !wer.has(b.id))) continue;
        let t_ = takt(w.uhrzeit, w.tage, w.feiertage);
        if (w.profilzeit) {
          // Wie bisher die Tägliche Zusammenfassung: Uhrzeit, Wochentage und Feiertage aus dem Profil, sonst die Karte.
          const z = wirksameZeit((await this.d.dienst.mappen.persoenlicheEinstellungen(b.id)).aufgaben_mail_zeit, {
            aktiv: true,
            uhrzeit: w.uhrzeit,
            bundesland,
          });
          t_ = takt(z.uhrzeit, z.tage, z.feiertage);
        }
        await laufeFaellige(merker(`zeitplan_zuletzt:${sk}:${b.id}`), ort, t_, async (tag) => {
          await this.reihe(liste, {
            id: uuidAus(`zeitplan|${schluessel}|${b.id}|${tag}`),
            art: 'zeitplan',
            daten: { benutzer: b.id, tag },
            kette: 0,
          });
        });
      }
    }
  }
}
