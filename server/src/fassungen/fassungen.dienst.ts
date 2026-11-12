/**
 * Fassungen (#1006): wer wann was an Einstellungen der Werkbank geändert hat – festhalten, zeigen, vergleichen und
 * wiederherstellen, für alle Gegenstände gleich. Schicht 3 – bekommt den Kern; die Gegenstände melden sich mit
 * `registriere` an (Stand lesen, alle Einträge, über das normale Speichern wiederherstellen, Hinweise vorher).
 *
 * - **Festhalten** (`halte`): nach jedem Speichern liest Ablago den Stand des Eintrags und legt eine Fassung an, wenn
 *   er sich geändert hat – mit Urheber aus dem Kern (Person, Paket, Automatisierung, Update, Ablago). Dieselbe Person
 *   innerhalb weniger Minuten und Schritte eines Vorgangs ergeben eine Fassung (`zusammenfassen`, shared/src/fassungen.ts).
 * - **Löschen** (`geloescht`): erst den letzten Stand festhalten, dann löschen, dann nur diese Fassung mit Löschvermerk
 *   behalten – für den Nachweis.
 * - **Wiederherstellen** (`stelleWiederHer`): nur auf dem Stand, den die Person gesehen hat (#917), über das normale
 *   Speichern des Gegenstands (dieselben Prüfungen und Rückfragen); das Ergebnis ist eine neue Fassung.
 * - **Abgleich beim Start** (`abgleich`): einmal je Version von Ablago – was Migrationen und Umzüge geändert haben, wird
 *   eine Fassung „Update auf Ablago …“; Einträge ohne Fassung bekommen ihre erste.
 */
import type { FassungsAnschluss, Kern } from '../kern';
import { Fachfehler } from '../fehler';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import {
  FASSUNG_ARTEN, FASSUNGEN_JE_SEITE, fassungsStand, gleicheStaende, personenIn, urheberText, zusammenfassen,
  type FassungArt, type FassungEintrag, type FassungsListe, type FassungsVorschau, type GeloeschterEintrag, type GespeicherteFassung, type Urheber,
} from '../../../shared/src/fassungen';
import { beschreibeAenderungen, type Vergleichskontext } from '../../../shared/src/fassungsvergleich';

const log = protokoll.modul('werkbank');

/** Was beim Wiederherstellen mitkommt: Bestätigungen der Rückfragen des normalen Speicherns. */
export interface Wiederherstellen {
  von: { id: string | null; email: string | null };
  /** „Trotzdem speichern“, z. B. wenn danach niemand Mappen des Typs lesen dürfte (#142). */
  bestaetigt: boolean;
  /** Zusammengesetzte Felder (#1050): mehrere Mappen hätten dieselbe Kombination. */
  doppelteBestaetigt: boolean;
  /** Paket-Einstellungen (#444): eine Dienst-Adresse bestätigen. */
  adresseBestaetigt: boolean;
  /** Verwaltet die Person den Bereich? Für Prüfungen wie beim Speichern (Werkbank-Karten der Automatisierungen, #677). */
  darf?: (bereich: string) => boolean;
}

/** Ein Gegenstand mit Fassungen. */
export interface Gegenstand {
  art: FassungArt;
  /** Stand eines Eintrags ohne Zeitstempel und Geheimnisse; undefined = gibt es nicht. `repo`: das der laufenden Änderung. */
  stand(eintrag: string, repo: Repo): Promise<{ name: string; daten: unknown } | undefined>;
  /** Alle Einträge (Abgleich beim Start). */
  alle(repo: Repo): Promise<string[]>;
  /** Über das normale Speichern wiederherstellen – mit allen Prüfungen und Rückfragen. */
  stelleHer(eintrag: string, daten: unknown, o: Wiederherstellen): Promise<void>;
  /** Worauf vor dem Wiederherstellen zu achten ist (z. B. Felder mit Werten fallen weg). */
  hinweise?(eintrag: string, jetzt: unknown, ziel: unknown): Promise<string[]>;
  /** Nachschlagen für die lesbaren Änderungen. */
  kontext?(eintrag: string): Promise<Vergleichskontext>;
}

/** Was die Fassungen außer dem Kern brauchen. */
export interface FassungenAnschluss {
  /** Einstellung lesen bzw. schreiben (Abgleich einmal je Version). */
  einstellung?: () => { lies(k: string): Promise<unknown>; schreibe(k: string, w: unknown): Promise<void> } | undefined;
  /** Uhr (Tests: Zusammenfassen nach Minuten). */
  uhr?: () => number;
}

/** JSON-Form: ohne undefined, damit Speicher und Datenbank gleich vergleichen. */
const sauber = (x: unknown): unknown => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const gleich = gleicheStaende;

export class Fassungen {
  private readonly gegenstaende = new Map<FassungArt, Gegenstand>();
  constructor(private readonly kern: Kern, private readonly anschluss: FassungenAnschluss = {}) {}

  private jetzt(): string { return new Date(this.anschluss.uhr?.() ?? Date.now()).toISOString(); }
  /** Uhr setzen (Tests). */
  stelleUhr(uhr: () => number) { this.anschluss.uhr = uhr; }

  /** Ein Gegenstand meldet sich an (ein zweites Mal ersetzt den ersten – Tests bauen Teile neu). */
  registriere(g: Gegenstand) { this.gegenstaende.set(g.art, g); }
  hat(art: FassungArt): boolean { return this.gegenstaende.has(art); }
  /** Für den Kern: festhalten bzw. Löschvermerk von Fachbereichen ohne Repo-Hülle. */
  fuerKern(): FassungsAnschluss {
    return { halte: (art, eintrag) => this.halte(art, eintrag), geloescht: (art, eintrag, loesche) => this.geloescht(art, eintrag, this.kern.repo, loesche) };
  }

  private gegenstand(art: FassungArt): Gegenstand {
    const g = this.gegenstaende.get(art);
    if (!g) throw new Fachfehler(404, t('meldungen.fassungen.unbekannt'));
    return g;
  }

  /** Urheber mit Name und Version eines Pakets, wie sie gerade installiert sind. */
  private async ergaenzt(u: Urheber, repo: Repo): Promise<Urheber> {
    if (u.art !== 'paket' || (u.version && u.name)) return u;
    const p = (await repo.listePakete()).find((x) => x.id === u.id);
    return { ...u, name: u.name ?? p?.name ?? null, version: u.version ?? p?.version ?? null };
  }

  /** Den Stand eines Eintrags nach dem Speichern festhalten (neue Fassung, fortgeschrieben oder nichts). */
  async halte(art: FassungArt, eintrag: string, repo: Repo = this.kern.repo): Promise<void> {
    const g = this.gegenstaende.get(art);
    if (!g || !eintrag) return;
    const s = await g.stand(eintrag, repo);
    if (!s) return;
    const daten = sauber(s.daten);
    const [letzte, davor] = await repo.fassungen(art, eintrag, 2);
    if (letzte && !letzte.geloescht && gleich(letzte.daten, daten)) return;
    const jetzt = this.jetzt();
    const neu = { urheber: await this.ergaenzt(this.kern.urheber(), repo), zeit: jetzt, vorgang: this.kern.vorgang(), wiederhergestellt: this.kern.wiederhergestellt() };
    if (letzte && zusammenfassen(letzte, neu)) {
      // Wieder beim Stand davor: Diese Fassung hat nichts geändert.
      if (davor && !davor.geloescht && !letzte.wiederhergestellt && gleich(davor.daten, daten)) await repo.loescheFassung(art, eintrag, letzte.nr);
      else await repo.schreibeFassungFort(art, eintrag, letzte.nr, { name: s.name, daten, bis: jetzt });
      return;
    }
    await repo.legeFassungAn({
      art, eintrag, nr: (letzte?.nr ?? 0) + 1, name: s.name, daten, urheber: neu.urheber, vorgang: neu.vorgang, wiederhergestellt: neu.wiederhergestellt,
      zeit: jetzt, bis: jetzt, geloescht: null,
    });
  }

  /** Löschen mit Vermerk: vorher den letzten Stand festhalten, nach dem Löschen nur ihn mit Löschvermerk behalten. */
  async geloescht(art: FassungArt, eintrag: string, repo: Repo, loesche: () => Promise<void>): Promise<void> {
    if (!this.gegenstaende.has(art)) { await loesche(); return; }
    await this.halte(art, eintrag, repo);
    await loesche();
    // Gibt es den Eintrag noch (ein Systemeintrag, der nicht weg darf, oder eine Kern-Vorgabe einer Automatisierungsvorlage,
    // die nach dem Zurücksetzen wieder gilt), kein Löschvermerk – der Stand danach wird eine Fassung, falls er sich geändert hat.
    if (await this.gegenstand(art).stand(eintrag, repo)) { await this.halte(art, eintrag, repo); return; }
    await repo.vermerkeLoeschung(art, eintrag, { zeit: this.jetzt(), urheber: await this.ergaenzt(this.kern.urheber(), repo) });
  }

  /** Namen für Urheber: Personen und Automatisierungen (auch gelöschte, aus ihrer letzten Fassung). */
  private async namen(fassungen: Array<Pick<GespeicherteFassung, 'urheber' | 'geloescht'>>): Promise<{ person(id: string): string; auto(id: string): string }> {
    const urheber = fassungen.flatMap((f) => [f.urheber, f.geloescht?.urheber]);
    const ids = personenIn(urheber);
    const titel = ids.length ? await this.kern.repo.titelVon(ids) : new Map<string, string>();
    const autos = new Map<string, string>();
    for (const u of urheber) {
      if (u?.art !== 'automatisierung' || autos.has(u.id)) continue;
      autos.set(u.id, (await this.kern.repo.fassungen('automatisierung', u.id, 1))[0]?.name ?? '?');
    }
    return { person: (id) => titel.get(id) || t('meldungen.fassungen.unbekannt-person'), auto: (id) => autos.get(id) ?? '?' };
  }

  /** Fassungen eines Eintrags, neueste zuerst, je mit lesbaren Änderungen zur Fassung davor. */
  async liste(art: FassungArt, eintrag: string): Promise<FassungsListe> {
    const g = this.gegenstand(art);
    const repo = this.kern.repo;
    const geladen = await repo.fassungen(art, eintrag, FASSUNGEN_JE_SEITE + 1);
    const gesamt = geladen.length > FASSUNGEN_JE_SEITE ? await repo.zaehleFassungen(art, eintrag) : geladen.length;
    const k = (await g.kontext?.(eintrag)) ?? {};
    const n = await this.namen(geladen);
    const fassungen: FassungEintrag[] = geladen.slice(0, FASSUNGEN_JE_SEITE).map((f, i) => {
      const davor = geladen[i + 1];
      const aenderungen = davor ? beschreibeAenderungen(art, davor.daten, f.daten, k)
        : f.geloescht ? [] : f.urheber.art === 'update' ? [t('meldungen.fassungen.erste')] : beschreibeAenderungen(art, null, f.daten, k);
      return {
        nr: f.nr, zeit: f.zeit, bis: f.bis, name: f.name, urheber: f.urheber, wer: urheberText(f.urheber, n.person, n.auto),
        wiederhergestellt: f.wiederhergestellt, geloescht: f.geloescht ? { ...f.geloescht, wer: urheberText(f.geloescht.urheber, n.person, n.auto) } : null,
        aenderungen: f.wiederhergestellt ? [t('meldungen.fassungen.wiederhergestellt', { nr: f.wiederhergestellt }), ...aenderungen] : aenderungen,
        aktuell: i === 0 && !f.geloescht,
      };
    });
    return { fassungen, stand: fassungsStand(geladen[0]), gesamt };
  }

  private async fassung(art: FassungArt, eintrag: string, nr: number): Promise<GespeicherteFassung> {
    const f = Number.isSafeInteger(nr) ? await this.kern.repo.fassung(art, eintrag, nr) : undefined;
    if (!f) throw new Fachfehler(404, t('meldungen.fassungen.fehlt'));
    return f;
  }

  /** Zwei Fassungen vergleichen: was sich von `von` zu `bis` geändert hat. */
  async vergleich(art: FassungArt, eintrag: string, von: number, bis: number): Promise<{ von: number; bis: number; aenderungen: string[] }> {
    const g = this.gegenstand(art);
    const [a, b] = [await this.fassung(art, eintrag, von), await this.fassung(art, eintrag, bis)];
    const k = (await g.kontext?.(eintrag)) ?? {};
    return { von, bis, aenderungen: beschreibeAenderungen(art, a.daten, b.daten, k) };
  }

  /** Was das Wiederherstellen dieser Fassung bewirkt: Änderungen gegenüber jetzt und worauf zu achten ist. */
  async vorschau(art: FassungArt, eintrag: string, nr: number): Promise<FassungsVorschau> {
    const g = this.gegenstand(art);
    const f = await this.fassung(art, eintrag, nr);
    const jetzt = await g.stand(eintrag, this.kern.repo);
    if (!jetzt) throw new Fachfehler(409, t('meldungen.fassungen.geloescht'));
    const k = (await g.kontext?.(eintrag)) ?? {};
    const aenderungen = gleich(jetzt.daten, f.daten) ? [] : beschreibeAenderungen(art, jetzt.daten, f.daten, k);
    const hinweise = aenderungen.length ? (await g.hinweise?.(eintrag, sauber(jetzt.daten), f.daten)) ?? [] : [];
    return { nr, aenderungen, hinweise, stand: fassungsStand((await this.kern.repo.fassungen(art, eintrag, 1))[0]) };
  }

  /**
   * Fassung `nr` wiederherstellen: nur auf dem Stand, den die Person gesehen hat (`stand`, #917), über das normale
   * Speichern des Gegenstands; das Ergebnis ist eine neue Fassung mit Verweis auf `nr`.
   */
  async stelleWiederHer(art: FassungArt, eintrag: string, nr: number, eingabe: unknown, wer: Wiederherstellen['von'] & Pick<Wiederherstellen, 'darf'>): Promise<FassungsListe> {
    const { darf, ...von } = wer;
    const g = this.gegenstand(art);
    const f = await this.fassung(art, eintrag, nr);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const aktuell = fassungsStand((await this.kern.repo.fassungen(art, eintrag, 1))[0]);
    if (typeof e.stand === 'string' && e.stand !== aktuell) throw new Fachfehler(409, t('meldungen.fassungen.konflikt'), { konflikt: true, stand: aktuell });
    const jetzt = await g.stand(eintrag, this.kern.repo);
    if (!jetzt) throw new Fachfehler(409, t('meldungen.fassungen.geloescht'));
    if (gleich(jetzt.daten, f.daten)) throw new Fachfehler(409, t('meldungen.fassungen.schon-aktuell'));
    await this.kern.mitFassungsKontext({ wiederhergestellt: nr }, async () => {
      await g.stelleHer(eintrag, structuredClone(f.daten), { von, bestaetigt: e.bestaetigt === true, doppelteBestaetigt: e.doppelteBestaetigt === true, adresseBestaetigt: e.adresseBestaetigt === true, darf });
      // Gegenstände ohne eigenen Haken: sicher festhalten (gleicher Vorgang → dieselbe Fassung).
      await this.halte(art, eintrag);
    });
    log.info('Fassung wiederhergestellt', { art, eintrag, nr, von: von.email });
    return this.liste(art, eintrag);
  }

  /** Gelöschte Einträge der genannten Arten mit ihrer letzten Fassung und dem Löschvermerk. */
  async geloeschte(arten: readonly FassungArt[] = FASSUNG_ARTEN): Promise<GeloeschterEintrag[]> {
    const liste = await this.kern.repo.geloeschteFassungen(arten);
    const n = await this.namen(liste);
    return liste.map((f) => ({ art: f.art, eintrag: f.eintrag, name: f.name, nr: f.nr, geloescht: { ...f.geloescht!, wer: urheberText(f.geloescht!.urheber, n.person, n.auto) } }));
  }

  /** Alle Fassungen für den Vollexport. */
  alle(): Promise<GespeicherteFassung[]> { return this.kern.repo.alleFassungen(); }

  /**
   * Abgleich beim Start (einmal je Version): Was sich seit der letzten Fassung geändert hat – durch Migrationen und
   * Umzüge des Updates –, wird eine Fassung „Update auf Ablago <version>“; Einträge ohne Fassung bekommen ihre erste;
   * was ohne Löschvermerk verschwunden ist, bekommt ihn. Liefert die Zahl der neuen Fassungen und Vermerke.
   */
  async abgleich(version: string): Promise<number> {
    const e = this.anschluss.einstellung?.();
    if (e && (await e.lies('fassungen_abgleich')) === version) return 0;
    let n = 0;
    await this.kern.mitFassungsKontext({ urheber: { art: 'update', version } }, async () => {
      const repo = this.kern.repo;
      for (const g of this.gegenstaende.values()) {
        const letzte = await repo.letzteFassungen(g.art);
        const da = new Set(await g.alle(repo));
        for (const id of da) {
          const s = await g.stand(id, repo);
          const l = letzte.get(id);
          if (!s || (l && !l.geloescht && gleich(l.daten, s.daten))) continue;
          await this.halte(g.art, id, repo);
          n++;
        }
        for (const [id, l] of letzte) {
          if (da.has(id) || l.geloescht) continue;
          await repo.vermerkeLoeschung(g.art, id, { zeit: this.jetzt(), urheber: { art: 'update', version } });
          n++;
        }
      }
    });
    if (e) await e.schreibe('fassungen_abgleich', version);
    if (n) log.info('Fassungen nach dem Update abgeglichen', { version, anzahl: n });
    return n;
  }
}
