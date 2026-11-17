/**
 * Rechte und Zugang im Routen-Kontext (#1278, Schritt 6b-1: aus `routenKontext` verschoben, unverändert): Zugriff der
 * Anfrage, Rechte an Mappen, Spur im Verwaltungsmodus, Einrichtungsassistent, Sicherungs-Pakete und Wartungsmodus.
 */
import { teiltypen } from '../../../shared/src/teile';
import type { Benutzer, Mappe } from '../../../shared/src/model';
import type { Recht } from '../../../shared/src/rechte';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';
import type { Konten } from '../konten';
import { zuletztListe } from '../konten/konto-repo';
import { t } from '../sprache/sprache';
import { darfBereich, darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { WartungFehler } from '../wartung/wartung';
import { L, ich } from './routen-hilfen';
import type { Anfrage } from './routen-typen';
import type { RoutenExtras } from './routen-extras';

/** Zugriff und Rechte der Anfrage an Mappen, Empfängern und Passwörtern. */
export function rechteHilfen(dienst: Dienst, konten: Konten) {
  /** Berechtigungen (#124): Zugriff des Benutzers, einmal je Anfrage. */
  const zg = (a: Anfrage) => dienst.rechtepruefung.zugriff(ich(a));
  /** #137: Empfänger von Aufgaben nur unter den Benutzern, die man sieht. */
  const empfaengerSichtbar = async (a: Anfrage, id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (!(await dienst.rechtepruefung.lesbare(await zg(a), [id])).has(id))
      throw new Fachfehler(422, t('meldungen.routen.diesen-benutzer-gibt-es'));
  };
  /** #127: Darf der Empfänger die Mappe lesen? Sonst ein Hinweis in der Antwort. */
  const leseHinweis = async (empfaengerId: string | null, mappeId: string) =>
    empfaengerId && !(await dienst.rechtepruefung.kannLesen(empfaengerId, mappeId))
      ? { hinweis: t('meldungen.routen.gespeichert-der-empfaenger-darf') }
      : {};
  const darf = async (a: Anfrage, mappeId: string, recht: Recht) => dienst.rechtepruefung.pruefeRecht(await zg(a), mappeId, recht);
  /** „Zuletzt geöffnet“ (#334, #940): nur lesbare Mappen außerhalb des Papierkorbs, neueste oben, je mit Zeitpunkt. */
  const zuletztGeoeffnet = async (a: Anfrage, anzahl: number) => {
    const liste = zuletztListe((await konten.einstellungen(ich(a))).zuletzt_geoeffnet);
    const ids = liste.map((x) => x.id);
    const lesbar = await dienst.rechtepruefung.lesbare(await zg(a), ids);
    const bezuege = await dienst.dokumente.bezuegeVon(ids.filter((id) => lesbar.has(id)));
    // Teile (#1031) nicht: Sie erscheinen nur an ihrer übergeordneten Mappe.
    const teile = teiltypen((await zg(a)).typen.values());
    return liste
      .filter((x) => bezuege.has(x.id) && !teile.has(bezuege.get(x.id)!.typId))
      .slice(0, anzahl)
      .map((x) => ({ id: x.id, typId: bezuege.get(x.id)!.typId, titel: bezuege.get(x.id)!.titel, am: x.am }));
  };
  /** Klartext von Passwörtern nur für Mappen mit Recht P; die anderen bleiben verdeckt. */
  const entschluessele = async <T extends Mappe>(a: Anfrage, mappen: T[], klartext: string): Promise<T[]> => {
    const { mit } = await dienst.rechtepruefung.mitPasswortRecht(await zg(a), mappen);
    const klar = new Map((await dienst.passwortfelder.entschluesselePasswoerter(mit, klartext, ich(a).id)).map((m) => [m.id, m]));
    return mappen.map((m) => klar.get(m.id) ?? m);
  };
  /** Benutzer mit ihren weiteren Rollen (#27). */
  const mitRollen = async (b: Benutzer) => ({ ...b, rollen: (await dienst.systemtypen.weitereRollen()).get(b.id) ?? [] });
  const typName = async (id: string) => (await dienst.mappentypen.listeTypen()).find((t) => t.id === id)?.name ?? id;
  return { zg, empfaengerSichtbar, leseHinweis, darf, zuletztGeoeffnet, entschluessele, mitRollen, typName };
}

/**
 * Wer fragt, und wohin er darf: Einrichtungsassistent, Hinweis auf technische Aufgaben, Spur im Verwaltungsmodus,
 * Pakete mit Sicherungsrecht, Wiederherstellen und Anmeldung im Wartungsmodus.
 */
export function zugangHilfen(dienst: Dienst, konten: Konten, x: RoutenExtras, zg: ReturnType<typeof rechteHilfen>['zg']) {
  const wer = (a: Anfrage) => ({ id: a.benutzer?.id ?? null, email: a.benutzer?.email ?? null });
  /**
   * Hilfen des Einrichtungsassistenten (#804, #806): Code vor der Einrichtung, danach bei offenem Assistenten eine
   * Person mit „Gesamte Verwaltung“ (#818) – nicht in einer Vertretung und nicht mit API-Schlüssel.
   */
  const einrichtungZugang = async (a: Anfrage) => {
    if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
    await x.einrichtung.pruefeZugang(
      a.einrichtungscode,
      !!a.benutzer && !a.apiSchluessel && hatGesamt(a.benutzer) && !a.sitzungsDaten?.vertretungId,
    );
  };
  /**
   * Technische Aufgaben (#719, #819): Hinweis ohne Einzelheiten für Personen mit Verwaltungsrecht außerhalb des
   * Verwaltungsmodus, wenn in einem ihrer Bereiche etwas anliegt – nicht in einer Vertretung, und nur ja/nein.
   */
  const verwaltungHinweis = async (a: Anfrage): Promise<boolean> => {
    if (!a.benutzer || a.benutzer.rolle === 'admin' || !darfVerwalten(a.benutzer) || a.sitzungsDaten?.vertretungId || !x.verwaltung)
      return false;
    try {
      return await x.verwaltung.offen(a.benutzer);
    } catch {
      return false;
    }
  };
  /**
   * Spur im Verwaltungsmodus (#820): Öffnet, lädt herunter, ändert, exportiert oder versendet jemand im Modus eine
   * Mappe, die er mit seinen Alltagsrechten nicht lesen dürfte, steht das dauerhaft in ihrer Historie. Liefert die
   * Mappen, für die das gilt.
   */
  const modusSpur = async (
    a: Anfrage,
    ids: string[],
    was: 'angesehen' | 'heruntergeladen' | 'geaendert' | 'exportiert' | 'versendet',
  ): Promise<Set<string>> => {
    if (a.benutzer?.rolle !== 'admin' || a.konsole || !ids.length) return new Set();
    return dienst.systemtypen.vermerkeVerwaltungsmodus({ ...a.benutzer, rolle: 'mitglied' }, ids, was);
  };
  /** Paket mit dms:sicherung-lesen (#585) bzw. dms:sicherung-holen (#976) – Menschen und andere Pakete bekommen 403. */
  const sicherungsPaket = async (
    a: Anfrage,
    recht: 'dms:sicherung-lesen' | 'dms:sicherung-holen' = 'dms:sicherung-lesen',
  ): Promise<string> => {
    const p = (await zg(a)).paket;
    if (!p) throw new Fachfehler(403, t('pakete.sicherung.nur-pakete'));
    if (!p.schnittstellen?.includes('dms:sicherung-lesen') || !p.schnittstellen.includes(recht))
      throw new Fachfehler(403, t('pakete.sicherung.recht'));
    return p.id;
  };
  /** Wiederherstellen im laufenden System (#107, #818): im Verwaltungsmodus mit Recht auf „Sicherung“. */
  const darfWiederherstellen = (a: Anfrage) => a.benutzer?.rolle === 'admin' && darfBereich(a.benutzer, 'sicherung');
  /** Ab der Ankündigung kommen nur Administratoren hinein (#102): eine neue Sitzung gleich wieder beenden. */
  const nurAdminsInWartung = async (r: { benutzer: Benutzer; schluessel: string }) => {
    if (!x.wartung?.sperrtAnmeldung(r.benutzer)) return;
    await konten.abmelden(r.schluessel);
    L.konto.info('Anmeldung im Wartungsmodus abgewiesen', { email: r.benutzer.email });
    throw new WartungFehler(x.wartung.meldung(), x.wartung.retryAfter());
  };
  return { wer, einrichtungZugang, verwaltungHinweis, modusSpur, sicherungsPaket, darfWiederherstellen, nurAdminsInWartung };
}
