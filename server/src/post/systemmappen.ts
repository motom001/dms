/**
 * Systemmappen (#43, #673, #1077 aus dienst.ts): Mappen, die das System pflegt (Post, Benutzer), Benutzer-Mappen
 * spiegeln und abgleichen, weitere Rollen, Systemkonten in der Werkbank und ihr Zugriff. Schicht 3 – bekommt den Kern,
 * die Rechteprüfung und Mappen; Ereignis, Passung, Aufgaben-Empfänger, Konten und Systemausstattung kommen über den
 * Anschluss (noch im Dienst).
 */
import { Fachfehler } from '../fehler';
import type { BenutzerGespiegelt, Kern, SystemIds, Zugreifender, Zugriff } from '../kern';
import { bereinigeWerte, type MappenHistorie, type MappenTitel } from '../mappen';
import type { Passung } from '../mappentypen';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { abwesenheitWirkt, type Benutzer, type Kontorolle, type Mappe, type Mappentyp, type Systemkonto, verweiseVon, type Werte } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import { systemkontoAuffaellig, type SystemkontoFehler } from '../../../shared/src/systemkonten';

/** Was mit dem Konto geschieht (Auszug aus `KontenHaken` in dienst.ts): Einstellungen und Konten der Menschen. */
export interface KontenAnschluss {
  benutzer?(): Promise<Benutzer[]>;
  setzeEinstellung?(id: string, schluessel: string, wert: unknown): Promise<void>;
}

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
/** Ein Konto, das kein Mensch ist (#673), für Werkbank → Benutzer. */
export interface SystemkontoEintrag {
  id: string; name: string; rolle: Kontorolle; aktiv: boolean; systemkonto?: string;
  paketId?: string; paket?: string | null; automatisierungen: Array<{ id: string; name: string; angehalten?: boolean }>;
  /**
   * Auffälligkeiten (#817), auch eingeklappt in der Kopfzeile sichtbar: `fehler` – Konto deaktiviert (obwohl sein
   * Paket noch da ist) oder eine seiner Automatisierungen angehalten; `weitreichend` – das Paket darf alle Mappentypen ändern oder alle
   * lesen und dazu ins Netz (`systemkontoAuffaellig` in shared/src/systemkonten.ts).
   */
  fehler?: SystemkontoFehler; weitreichend?: boolean;
}

/** Die Teile, die die Systemmappen rufen: Rechteprüfung, Passung, Historie und Titel. */
export interface SystemmappenTeile { rechte: ZugriffDienst; passung: Passung; historie: MappenHistorie; titel: MappenTitel }

/** Was die Systemmappen außer dem Kern brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface SystemmappenAnschluss {
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`; Tests ersetzen `dienst.kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null): Promise<void>;
  passungsAufgaben(liste: Array<{ id: string; problem: string | null }>): Promise<unknown>;
  /** Vorgabe „Favoriten benachrichtigen“ für neue Benutzer (#506; seit #1001 aus der Automatisierung). */
  favoritenVorgabe(): Promise<boolean>;
  vorgabeAufgabenEmpfaenger(b: Benutzer): Promise<unknown>;
  sichereSystem(): Promise<SystemIds>;
  konten(): KontenAnschluss | undefined;
  /** Vom Start (bzw. von Tests) am Dienst gesetzt (#673, #674). */
  systemkonten(): ((kennung: Systemkonto) => Promise<Benutzer>) | undefined;
  automatisierungenVon(): ((kontoId: string) => Promise<Array<{ id: string; name: string; angehalten?: boolean }>>) | undefined;
}

export class PostSystemmappen {
  constructor(private readonly kern: Kern, private readonly teile: SystemmappenTeile, private readonly anschluss: SystemmappenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private get systemkonten() { return this.anschluss.systemkonten(); }
  private get automatisierungenVon() { return this.anschluss.automatisierungenVon(); }
  private inEinemZug<T>(f: () => Promise<T>): Promise<T> { return this.kern.inEinemZug(f); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private meldeVerknuepft(...a: Parameters<SystemmappenAnschluss['meldeVerknuepft']>) { return this.anschluss.meldeVerknuepft(...a); }
  private passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) { return this.anschluss.passungsAufgaben(liste); }
  private favoritenVorgabe() { return this.anschluss.favoritenVorgabe(); }
  private vorgabeAufgabenEmpfaenger(b: Benutzer) { return this.anschluss.vorgabeAufgabenEmpfaenger(b); }
  private sichereSystem() { return this.anschluss.sichereSystem(); }
  private zugriff(ich: Zugreifender) { return this.teile.rechte.zugriff(ich); }
  private passungFuer(typ: Mappentyp, ids: string[]) { return this.teile.passung.passungFuer(typ, ids); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private aenderungen(typ: Mappentyp, alt: Werte, neu: Werte) { return this.teile.historie.aenderungen(typ, alt, neu); }
  private aktualisiereTitel(ids: string[]) { return this.teile.titel.aktualisiereTitel(ids); }

  /** Schreibt eine Mappe, die das System pflegt – ohne die Sperren der Ablage; Titel und Passung wie sonst. */
  async schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung: string | null = null): Promise<Mappe> {
    const alt = await this.repo.holeMappe(id);
    const werte = bereinigeWerte(typ, eingabe, alt?.werte);
    if (alt && JSON.stringify(alt.werte) === JSON.stringify(werte)) return alt;
    const aenderungen = await this.aenderungen(typ, alt?.werte ?? {}, werte);
    // Feldweise (#609): Felder, die inzwischen ein Mensch geändert hat, bleiben.
    const neu = alt ? await this.repo.aendereMappe(id, werte, [], von, { basis: alt.werte, verweise: (w) => verweiseVon(typ, w) }) : undefined;
    if (!alt) await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), von, false, kennung);
    if (aenderungen.length) await this.notiere(id, von, alt ? 'geaendert' : 'angelegt', { aenderungen, ...(neu ? { stand: neu.geaendert } : {}) });
    await this.meldeVerknuepft(typ, id, alt?.werte ?? {}, werte, von);
    if (alt) await this.passungsAufgaben([{ id, problem: null }]);
    await this.aktualisiereTitel([id]);
    // Hat der Administrator den Typ um Pflichtfelder erweitert, landet die Mappe im Eingang.
    await this.passungFuer(typ, [id]);
    return (await this.repo.holeMappe(id))!;
  }

  /** Mappe eines Benutzers anlegen oder nachziehen. Weitere Rollen bleiben, die Systemrolle folgt dem Konto. */
  async spiegleBenutzer(b: Benutzer, von: string | null = null, abwesenheit?: BenutzerGespiegelt['abwesenheit']) {
    // Liegt die Mappe im Papierkorb, bleibt sie dort (der Benutzer ist bis zum Leeren deaktiviert).
    if (await this.repo.holeAusPapierkorb(b.id)) return;
    const { benutzer: typ, systemrollen } = await this.kern.system();
    const alt = await this.repo.holeMappe(b.id);
    // Neuer Benutzer (#506): Vorgabe „Favoriten benachrichtigen“ aus der Werkbank – nur, wenn sie aus ist.
    if (!alt && b.art !== 'dienst' && !(await this.favoritenVorgabe())) await this.konten?.setzeEinstellung?.(b.id, 'favoriten_benachrichtigen', false);
    // #719: Der erste Mensch ohne Admin-Rechte bekommt die Aufgaben ohne Empfänger, bis die Werkbank anders wählt.
    if (!alt) await this.vorgabeAufgabenEmpfaenger(b);
    const system = new Set(systemrollen.values());
    const weitere = alt ? alsListe(alt.werte.rollen).filter((r) => !system.has(r)) : [];
    const ab = b.abwesenheit;
    // In einer Transaktion (#962): Benutzer-Mappe, Ereignis und die sofortigen Empfänger (Abwesenheit) ganz oder gar nicht.
    await this.inEinemZug(async () => {
      // Ereigniskatalog (#670): Benutzer deaktiviert bzw. wieder aktiviert (die Mappe folgt dem Konto).
      if (alt && alt.werte.aktiv !== b.aktiv) await this.ereignis(b.aktiv ? 'benutzer.aktiviert' : 'benutzer.deaktiviert', { benutzer: b.id }, von);
      // Abwesenheit (#78): „abwesend“ = wirkt heute; Zeitraum nur, solange sie an ist; der Vertreter auch nach dem Deaktivieren.
      await this.schreibeSystemMappe(typ, b.id, {
        ...(alt?.werte ?? {}),
        // Systemrolle ist für jeden Menschen „Mitglied“ (#818: die Systemrolle „Administrator“ ist entfallen).
        name: b.name || b.email, email: b.email, rollen: [systemrollen.get('mitglied')!, ...weitere], aktiv: b.aktiv,
        abwesend: abwesenheitWirkt(ab, heuteIn()),
        abwesend_von: ab?.an ? ab.von : null, abwesend_bis: ab?.an ? ab.bis : null,
        vertreter: ab?.vertreterId && (ab.an || !b.aktiv) ? ab.vertreterId : null,
      }, von);
      await this.kern.anlaesse.benutzerGespiegelt.melde({ benutzer: b, von, ...(abwesenheit ? { abwesenheit } : {}) });
    });
  }

  /** Beim Start: alle Benutzer haben ihre Mappe, und sie stimmt mit dem Konto überein. */
  async gleicheBenutzerAb(liste: Benutzer[], fortschritt: (fertig: number, gesamt: number) => void = () => {}) {
    await this.sichereSystem();
    // Fortschritt für die Startseite (#802).
    for (const [i, b] of liste.entries()) { fortschritt(i, liste.length); await this.spiegleBenutzer(b); }
  }

  /** Prüft eine Auswahl weiterer Rollen, bevor etwas geändert wird; liefert die bereinigten Ids. */
  async pruefeRollen(eingabe: unknown): Promise<string[]> {
    if (!Array.isArray(eingabe)) throw new Fachfehler(422, t('meldungen.dienst.rollen-als-liste-angeben'));
    const ids = [...new Set(eingabe.map(String))];
    const { rolle, systemrollen, kontorollen } = await this.kern.system();
    const typVon = await this.repo.typenVon(ids.filter(istUuid));
    if (ids.some((id) => typVon.get(id) !== rolle.id)) throw new Fachfehler(422, t('meldungen.dienst.mindestens-eine-dieser-rollen'));
    const system = new Set(systemrollen.values());
    if (ids.some((id) => system.has(id))) throw new Fachfehler(422, t('meldungen.dienst.die-systemrolle-mitglied-hat'));
    if (ids.some((id) => [...kontorollen.values()].includes(id))) throw new Fachfehler(422, t('konten.fehler.kontorolle'));
    return ids;
  }

  /** Weitere (fachliche) Rollen eines Benutzers setzen – nur aus der Benutzerverwaltung. */
  async setzeRollen(benutzerId: string, eingabe: unknown, von: string | null = null) {
    const ids = await this.pruefeRollen(eingabe);
    const { benutzer: typ, systemrollen } = await this.kern.system();
    const m = await this.repo.holeMappe(benutzerId);
    if (!m || m.typId !== typ.id) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const system = new Set(systemrollen.values());
    const behalten = alsListe(m.werte.rollen).filter((r) => system.has(r));
    await this.schreibeSystemMappe(typ, benutzerId, { rollen: [...behalten, ...ids] }, von);
  }

  /** Alle Rollen für die Auswahl in der Benutzerverwaltung; Systemrollen zuerst. */
  async listeRollen(mitKonten = false) {
    const { rolle, kontorollen } = await this.kern.system();
    const konto = new Set(kontorollen.values());
    return (await this.repo.listeMappen(rolle.id))
      // Systemkonto und Paket (#673) vergibt niemand an Menschen – in Benutzerverwaltung und Freigaben nicht zur Wahl.
      .filter((m) => mitKonten || !konto.has(m.id))
      .map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), system: !!m.systemKennung, ...(konto.has(m.id) ? { konto: true } : {}) }))
      .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'de'));
  }

  /**
   * Werkbank → Benutzer, Abschnitt „Systemkonten“ (#673): das Systemkonto „Automatisierung“ und die Dienstkonten der
   * Pakete mit ihrer Systemrolle; je Konto, welche Automatisierungen es ausführt (kommt mit #674 über `automatisierungenVon`).
   */
  async systemkontenUebersicht(system: Benutzer[], dienst: Benutzer[]): Promise<SystemkontoEintrag[]> {
    const pakete = new Map((await this.repo.listePakete()).map((p) => [p.id, p]));
    const eintrag = async (b: Benutzer, rolle: Kontorolle): Promise<SystemkontoEintrag> => {
      const paket = b.paketId ? pakete.get(b.paketId) ?? null : undefined;
      const automatisierungen = (await this.automatisierungenVon?.(b.id)) ?? [];
      const a = systemkontoAuffaellig({ aktiv: b.aktiv, rolle, paket: paket === undefined ? undefined : paket ? paket.name : null, automatisierungen, rechte: paket?.laeufer });
      return {
        id: b.id, name: b.name, rolle, aktiv: b.aktiv,
        ...(b.systemkonto ? { systemkonto: b.systemkonto } : {}),
        ...(b.paketId ? { paketId: b.paketId, paket: paket?.name ?? null } : {}),
        automatisierungen,
        ...(a.fehler ? { fehler: a.fehler } : {}), ...(a.weitreichend ? { weitreichend: true } : {}),
      };
    };
    return [...await Promise.all(system.map((b) => eintrag(b, 'systemkonto'))), ...await Promise.all(dienst.map((b) => eintrag(b, 'paket')))];
  }

  /** Zugriff eines Systemkontos (#673), z. B. für Automatisierungen: Rechte aus den Regeln für die Rolle „Systemkonto“. */
  async systemZugriff(kennung: Systemkonto = 'automatisierung'): Promise<Zugriff> {
    if (!this.systemkonten) throw new Fachfehler(500, t('meldungen.dienst.systemkonten-sind-nicht-eingerichtet'));
    return this.zugriff(await this.systemkonten(kennung));
  }
}
