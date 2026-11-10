/**
 * Aufgaben bei Personen ohne Leserecht (#798, #958, #1078 aus dienst.ts): Hinweis statt Text, Fälle abgleichen, Leserecht
 * auf Zeit, Übersichten der Werkbank. Schicht 3 – Teile und Anschluss wie `AufgabenDienst` (aufgaben.dienst.ts).
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import type { Kern, Zugreifender, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import { rechteMessen } from '../messung';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import type { Aufgabe, FallEnde, FallOhneLeserecht } from '../../../shared/src/model';
import type { AufgabenAnschluss, AufgabenTeile } from './aufgaben.dienst';
import { SAMMEL_WEITERGABE } from './vertretung';

export class OhneLeserecht {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private inAnfrage(): boolean { return this.kern.inAnfrage(); }
  private nachDerAntwort(f: () => Promise<unknown>): Promise<void> | void { return this.kern.nachDerAntwort(f); }
  private zugriff(ich: Zugreifender): Promise<Zugriff> { return this.teile.rechte.zugriff(ich); }
  private bildeZugriff(ich: Zugreifender, o: { ohneAufZeit?: boolean } = {}): Promise<Zugriff> { return this.teile.rechte.bildeZugriff(ich, o); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.teile.rechte.lesbare(...a); }

  /**
   * Automatische Aufgaben zu Mappen, die der Empfänger nicht lesen darf (#798): Statt des Textes steht nur „Aufgabe zu
   * einer Mappe, die du nicht sehen darfst – frag …“ (wer die Mappe angelegt hat, sonst ein Administrator); die
   * Fälligkeit bleibt – außer bei Fristen und Aufgaben zu einem Datumsfeld: Deren Datum ist ein Wert der Mappe und fällt
   * samt Feld weg (#958). Von Hand geschriebene Texte (Zugewiesen, Erinnerung – von einem Menschen) bleiben sichtbar.
   * `lesbar`: die Mappen, die er lesen darf. Gilt für „Zu erledigen“, die Mappe ohne Leserecht und die Tägliche Zusammenfassung.
   */
  async ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]> {
    const fremd = liste.filter((a) => !lesbar.has(a.mappeId));
    if (!fremd.length) return liste;
    const menschen = new Set(this.konten?.benutzer ? (await this.konten.benutzer()).map((b) => b.id) : []);
    const vonHand = (a: Aufgabe) => (a.art === 'manuell' || a.art === 'erinnerung') && !a.anlass
      && (!a.feldKey || a.feldKey === SAMMEL_WEITERGABE) && !!a.erstelltVon && menschen.has(a.erstelltVon);
    const ersteller = new Map((await this.repo.holeMappen([...new Set(fremd.map((a) => a.mappeId))])).map((m) => [m.id, m.erstelltVon] as const));
    const text = new Map<string, string>();
    for (const id of new Set(fremd.map((a) => a.mappeId))) {
      const e = ersteller.get(id);
      text.set(id, e && e !== ich && menschen.has(e) ? t('mappen.aufgabe.ohne-leserecht', { name: await this.name(e) }) : t('mappen.aufgabe.ohne-leserecht.admin'));
    }
    // #958: Bei Fristen (und Aufgaben zu einem Datumsfeld) sind Datum und Feld Werte der Mappe – ohne Leserecht weg.
    const ausFeld = (a: Aufgabe) => a.art === 'frist' || a.anlass?.art === 'datum';
    const ohneFeld = (a: T): T => (ausFeld(a) ? { ...a, datum: null, feldKey: null, anlass: null } : a);
    return liste.map((a) => (lesbar.has(a.mappeId) ? a : ohneFeld(vonHand(a) ? a : { ...a, text: text.get(a.mappeId)! })));
  }

  /** Zugriff eines anderen Benutzers, etwa für Platzhalter mit den Rechten des Empfängers (#795); kein Mensch: null. */
  async zugriffVon(benutzerId: string): Promise<Zugriff | null> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    return b ? this.zugriff(b) : null;
  }

  /** Wie sichtbarFuer, aber ohne Leserechte auf Zeit (#798): Was erlauben die Berechtigungen selbst? */
  async regulaerSichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await rechteMessen(() => this.bildeZugriff(b, { ohneAufZeit: true })), ids);
  }

  /**
   * Fälle abgleichen (#798): Wo liegt eine offene Aufgabe bei einem Menschen ohne Admin-Rechte, der die Mappe nach den
   * Berechtigungen nicht lesen darf? Neue Fälle anlegen; offene beenden, wenn die Aufgabe erledigt, gelöscht oder an
   * jemand anderen gegeben ist – oder die Person die Mappe inzwischen lesen darf. Endet ein Fall mit Leserecht auf
   * Zeit, steht der Entzug in der Historie der Mappe (das Recht selbst wirkt schon nicht mehr, sobald die Aufgabe
   * nicht mehr offen bei ihm liegt). Nach dem Vergeben, Weitergeben und Erledigen von Aufgaben (nur deren Mappen) und
   * regelmäßig für alle (Rechte geändert, Erwähnungen, Fristen …). Mehrere Server: Anlegen und Beenden sind eindeutig.
   */
  async faelleAbgleichen(f: { mappeIds?: string[] } = {}): Promise<{ neu: number; beendet: number }> {
    if (!this.konten?.benutzer || (f.mappeIds && !f.mappeIds.length)) return { neu: 0, beendet: 0 };
    const menschen = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const offen = (await this.repo.offeneAufgaben(f.mappeIds ? { mappeIds: f.mappeIds } : {})).filter((a) => a.empfaengerId && menschen.has(a.empfaengerId));
    const jeEmpfaenger = new Map<string, Aufgabe[]>();
    for (const a of offen) jeEmpfaenger.set(a.empfaengerId!, [...(jeEmpfaenger.get(a.empfaengerId!) ?? []), a]);
    const ohne = new Set<string>();
    for (const [id, liste] of jeEmpfaenger) {
      const ok = await this.regulaerSichtbarFuer(id, [...new Set(liste.map((a) => a.mappeId))]);
      for (const a of liste) if (!ok.has(a.mappeId)) ohne.add(a.id);
    }
    const nachId = new Map(offen.map((a) => [a.id, a] as const));
    const faelle = await this.repo.faelleOhneLeserecht({ offen: true, ...(f.mappeIds ? { mappeIds: f.mappeIds } : {}) });
    let beendet = 0;
    const bleiben = new Set<string>();
    for (const x of faelle) {
      const a = nachId.get(x.aufgabeId);
      let grund: FallEnde | null = null;
      let zeit: string | null = null;
      if (a) grund = a.empfaengerId !== x.benutzerId ? 'weitergegeben' : ohne.has(a.id) ? null : 'lesbar';
      else {
        const g = await this.repo.holeAufgabe(x.aufgabeId);
        if (!g || !(await this.repo.holeMappe(g.mappeId))) grund = 'geloescht';
        else if (g.erledigt) { grund = 'erledigt'; zeit = g.erledigt; }
        else if (g.empfaengerId !== x.benutzerId) grund = 'weitergegeben';
        // Offen bei ihm, aber kein Mensch ohne Admin-Rechte mehr (z. B. Administrator geworden): Er darf jetzt lesen.
        else grund = 'lesbar';
      }
      if (!grund) { bleiben.add(`${x.aufgabeId}|${x.benutzerId}`); continue; }
      if (!(await this.repo.beendeFall(x.id, grund, zeit))) continue;
      beendet++;
      if (x.leserechtSeit) {
        const name = await this.name(x.benutzerId);
        await this.notiere(x.mappeId, null, 'leserecht', { text: t.frei(`mappen.leserecht.entzogen.${grund}`, { name }), fall: x.id, fuer: x.benutzerId, aufgabe: x.aufgabeId, entzogen: true });
        protokoll.modul('ablage').info('Leserecht auf Zeit beendet', { mappeId: x.mappeId, fuer: name, grund });
      }
    }
    let neu = 0;
    for (const a of offen) {
      if (!ohne.has(a.id) || bleiben.has(`${a.id}|${a.empfaengerId}`)) continue;
      if (await this.repo.legeFallAn({ id: randomUUID(), aufgabeId: a.id, mappeId: a.mappeId, benutzerId: a.empfaengerId!, aufgabentext: a.text })) {
        neu++;
        protokoll.modul('ablage').info('Aufgabe bei einer Person ohne Leserecht', { mappeId: a.mappeId, fuer: await this.name(a.empfaengerId) });
      }
    }
    return { neu, beendet };
  }

  /**
   * Abgleich für einzelne Mappen nach dem Vergeben, Weitergeben oder Erledigen (#798) – ein Fehler hält die Aufgabe nicht auf.
   *
   * In einer Anfrage (#928) nach der Antwort, solange an diesen Mappen kein Leserecht auf Zeit hängt: Dann legt der Abgleich
   * höchstens Fälle für die Werkbank an oder schließt welche ohne Recht – an den Rechten ändert sich nichts, und die
   * Übersicht in der Werkbank gleicht vor dem Anzeigen ohnehin selbst ab. Hängt ein Leserecht auf Zeit daran, sofort:
   * Es endet mit der Aufgabe, nicht erst kurz danach („Nachhinken ja, falsch nie“).
   */
  async faelleNach(mappeIds: string[]) {
    const ids = [...new Set(mappeIds)];
    const abgleichen = async () => {
      try { await this.faelleAbgleichen({ mappeIds: ids }); }
      catch (e) { protokoll.modul('ablage').warn('Aufgaben ohne Leserecht nicht abgeglichen', { fehler: (e as Error).message }); }
    };
    if (!ids.length || !this.konten?.benutzer) return;
    if (this.inAnfrage()) {
      let mitRecht = true;
      try { mitRecht = (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: ids })).some((f) => f.leserechtSeit); } catch { /* dann sofort */ }
      if (!mitRecht) { void this.nachDerAntwort(abgleichen); return; }
    }
    await abgleichen();
  }

  /** Offene Fälle (#798) – für den Hinweis in der Werkbank und die Mail an die Administratoren (#719). */
  async offeneFaelle(): Promise<FallOhneLeserecht[]> { return this.repo.faelleOhneLeserecht({ offen: true }); }

  /** Werkbank → Aufgaben → Ohne Leserecht (#798): erst abgleichen, dann offene Fälle oben, vergangene darunter. */
  async faelleUebersicht(): Promise<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] }> {
    await this.faelleAbgleichen();
    const alle = await this.repo.faelleOhneLeserecht({ max: 500 });
    return { offen: alle.filter((x) => !x.ende), vergangen: alle.filter((x) => x.ende) };
  }

  /**
   * Leserecht für die Dauer der Aufgabe geben (#798, nur in der Werkbank): nur Lesen, nur diese Mappe; es endet von selbst,
   * wenn die Aufgabe erledigt, gelöscht oder an jemand anderen gegeben wird. Steht in der Historie der Mappe.
   */
  async leserechtAufZeitGeben(fallId: unknown, von: string | null): Promise<FallOhneLeserecht> {
    if (!istUuid(fallId)) throw new Fachfehler(404, t('werkbank.ohne-leserecht.fehler.weg'));
    const vorher = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (vorher) await this.faelleAbgleichen({ mappeIds: [vorher.mappeId] });
    const f = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (!f) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
    if (!f.leserechtSeit) {
      if (!(await this.repo.gibLeserechtAufZeit(f.id, von))) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
      const name = await this.name(f.benutzerId);
      const aufgabe = f.aufgabentext.length > 80 ? `${f.aufgabentext.slice(0, 79)}…` : f.aufgabentext;
      await this.notiere(f.mappeId, von, 'leserecht', { text: t('mappen.leserecht.vergeben', { name, aufgabe, von: await this.name(von) }), fall: f.id, fuer: f.benutzerId, aufgabe: f.aufgabeId, vergeben: true });
      protokoll.modul('werkbank').info('Leserecht auf Zeit gegeben', { mappeId: f.mappeId, fuer: name, von: await this.name(von) });
    }
    return (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: [f.mappeId] })).find((x) => x.id === f.id) ?? f;
  }

  /** Werkbank: alle offenen oder die zuletzt erledigten. */
  async alleAufgaben(erledigt = false) { return erledigt ? this.repo.erledigteAufgaben(500) : this.repo.offeneAufgaben(); }

  aufgabenVon(mappeId: string) { return this.repo.aufgabenVon(mappeId); }
}
