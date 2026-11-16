/**
 * Auslösen (#674, #1278 Teil von `Automatisierungen`): Ereignisse aus dem Katalog, „Datum in N Tagen“, Pause,
 * Reihenfolge und Bremse.
 */
import { AutomatisierungAusfuehren } from './ausfuehren';
import { type KatalogEreignis, EREIGNISKATALOG, wennFaehig } from '../../../../shared/src/ereignisse';
import {
  type Automatisierung,
  ausloeserSchluessel,
  PROTOKOLL_ABSTAND_MIN,
  istAufruf,
  istBetrieb,
  protokollPasst,
} from '../../../../shared/src/automatisierung';
import { alsListe, t } from './gemeinsam';
import { heuteIn, verschiebe } from '../../../../shared/src/sichten';
import { type WennDatum, uuidAus, tageBis, type Anlass } from './hilfen';

/** Ereignisse annehmen und Läufe der Reihe nach starten. */
export abstract class AutomatisierungAusloesen extends AutomatisierungAusfuehren {
  /* ---------- Auslösen ---------- */

  /** Abnehmer des Ereigniskatalogs: passende Automatisierungen nacheinander. Wirft nur, wenn die Datenbank streikt. */
  async ereignis(e: KatalogEreignis): Promise<void> {
    if (!(e.art in EREIGNISKATALOG) || !wennFaehig(e.art) || e.ausloeser?.still) return;
    const alle = await this.d.repo.liste();
    // „Mappe gespeichert“ mit „auch beim Anlegen“ (#1001) hört zusätzlich auf „Mappe angelegt“.
    let liste = alle.filter(
      (a) =>
        a.aktiv &&
        !a.angehalten &&
        (a.wenn.art === e.art || (e.art === 'mappe.angelegt' && a.wenn.art === 'mappe.geaendert' && a.wenn.angelegt === true)) &&
        this.passt(a, e),
    );
    // Protokollmeldung (#677): je Automatisierung höchstens ein Lauf in der Pause – auch über mehrere Prozesse.
    if (e.art === 'protokoll.meldung') liste = await this.ausserPause(liste);
    if (liste.length)
      await this.reihe(liste, {
        id: e.id,
        art: e.art,
        daten: e.daten,
        kette: e.ausloeser?.art === 'automatisierung' ? (e.ausloeser.kette ?? 1) : 0,
        ausloeser: e.ausloeser,
      });
    if (e.art === 'mappe.angelegt' || e.art === 'mappe.geaendert') await this.datumImVorlauf(e, alle);
  }

  /**
   * „Datum erreicht“ auch beim Speichern (#712, wie früher die Erinnerung am Feld): Liegt das Datum einer gespeicherten
   * Mappe schon im Vorlauf (heute bis Datum), läuft die Automatisierung sofort – sonst würde ein Datum, das erst nach dem
   * Erinnerungstag eingetragen wird, nie erinnern. Dieselbe Ereignis-Id wie im Zeitplan: je Mappe und Datum genau einmal.
   */
  private async datumImVorlauf(e: KatalogEreignis, alle: Automatisierung[]) {
    const mappe = e.daten.mappe,
      typ = e.daten.typ;
    if (typeof mappe !== 'string' || typeof typ !== 'string') return;
    const geaendert = e.art === 'mappe.geaendert' ? alsListe(e.daten.felder) : null;
    const kandidaten = alle.filter(
      (a) =>
        a.aktiv &&
        !a.angehalten &&
        a.wenn.art === 'datum' &&
        a.wenn.typ === typ &&
        a.wenn.vorlauf > 0 &&
        (!geaendert || geaendert.includes(a.wenn.feld)),
    );
    if (!kandidaten.length) return;
    const heute = heuteIn(new Date(this.jetzt()));
    const gruppen = new Map<string, Automatisierung[]>();
    for (const a of kandidaten) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
    for (const liste of gruppen.values()) {
      const w = liste[0].wenn as Extract<WennDatum, { art: 'datum' }>;
      const datum = await this.d.dienst.automatisierungshilfen.datumVon(mappe, w.feld);
      // Nur im Vorlauf: Datum heute oder später, Erinnerungstag erreicht (auch heute – lief der Zeitplan schon, holt es das nach).
      if (!datum || datum < heute || verschiebe(datum, -w.vorlauf, w.einheit) > heute) continue;
      await this.reihe(liste, {
        id: uuidAus(`datum|${ausloeserSchluessel(w)}|${mappe}|${datum}`),
        art: 'datum',
        daten: { mappe, typ, feld: w.feld, datum, tage: tageBis(datum, heute) },
        kette: 0,
      });
    }
  }

  /** Protokollmeldung (#677): ohne die, die in den letzten {@link PROTOKOLL_ABSTAND_MIN} Minuten schon liefen. */
  private async ausserPause<T extends Automatisierung>(liste: T[]): Promise<T[]> {
    const seit = new Date(this.jetzt() - PROTOKOLL_ABSTAND_MIN * 60_000).toISOString();
    const frei = await Promise.all(
      liste.map(
        async (a) => !(await this.d.repo.laeufe(a.id, 5)).some((l) => !l.test && l.zustand !== 'uebersprungen' && l.gestartet >= seit),
      ),
    );
    return liste.filter((_, i) => frei[i]);
  }

  private passt(a: Automatisierung, e: KatalogEreignis): boolean {
    const w = a.wenn;
    // Zeitplan, Datum und Aufruf von außen (#679) löst der Motor selbst aus, nie der Ereigniskatalog.
    if (w.art === 'datum' || w.art === 'zeitplan' || istAufruf(w)) return false;
    if (istBetrieb(w)) return w.art !== 'protokoll.meldung' || protokollPasst(w, e.daten);
    if (EREIGNISKATALOG[w.art].gruppe !== 'benutzer' && w.typ && e.daten.typ !== w.typ) return false;
    if (w.art === 'mappe.geaendert' && e.art === 'mappe.geaendert' && w.felder?.length) {
      const g = alsListe(e.daten.felder);
      if (!w.felder.some((f) => g.includes(f))) return false;
    }
    return true;
  }

  /** Automatisierungen eines Ereignisses nacheinander; „Danach keine weiteren …“ beendet die Reihe. */
  protected async reihe(liste: Automatisierung[], anlass: Anlass) {
    const sortiert = [...liste].sort(
      (a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id),
    );
    let stopp: string | null = null;
    for (const a of sortiert) {
      // Keine Selbstauslösung: Änderungen einer Automatisierung lösen sie selbst nicht noch einmal aus.
      if (anlass.ausloeser?.art === 'automatisierung' && anlass.ausloeser.id === a.id) continue;
      if (stopp) {
        await this.vermerke(a, anlass, 'uebersprungen', t('automatisierung.lauf.gestoppt', { name: stopp }));
        continue;
      }
      const l = await this.fuehreAus(a, anlass, { trocken: false, test: false });
      if (
        l?.zustand === 'abgeschlossen' &&
        l.schritte.some(
          (s) => s.karte && s.zustand === 'ok' && (s.teil === 'sonst' ? a.sonst : a.dann).find((k) => k.id === s.karte)?.art === 'stopp',
        )
      )
        stopp = a.name;
    }
  }
}
