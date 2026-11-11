/**
 * Hilfen für Automatisierungen (#674, #712, #1078 aus dienst.ts): was eine Automatisierung prüfen muss, Mitglieder einer
 * Rolle, Teile einer Und-Bedingung, lesbare Titel für Platzhalter, Datumsfelder. Schicht 2 – bekommt den Kern und die
 * Rechteprüfung; die Rollen (post/, Schicht 3) über den Anschluss.
 */
import type { Kern, Zugriff } from '../kern';
import type { Repo } from '../repo';
import type { ZugriffDienst } from '../zugriff';
import { istDatum } from '../../../shared/src/fristen';
import { type Bedingung, filterFuer, type Klausel, klauselnFuer, type Sicht } from '../../../shared/src/sichten';

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Was die Hilfen außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht. */
export interface AutomatisierungAnschluss {
  /** Rollen (#27; post/systemmappen.ts, über den Anschluss). */
  listeRollen(): Promise<Array<{ id: string; name: string }>>;
}

export class Automatisierungshilfen {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst, private readonly anschluss: AutomatisierungAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get paketKonten() { return this.kern.paketKonten; }
  private listeRollen() { return this.anschluss.listeRollen(); }
  private aufloesung(benutzerId: string) { return this.rechte.aufloesung(benutzerId); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.rechte.lesbare(...a); }

  /** Was eine Automatisierung prüfen muss: Mappentypen, Ansichten, Benutzer (ohne Systemkonten), Rollen. */
  async automatisierungKontext() {
    const { benutzer, kontorollen } = await this.kern.system();
    const konto = new Set(kontorollen.values());
    const [typen, sichten, rollen, leute] = await Promise.all([this.repo.listeTypen(), this.repo.listeSichten(), this.listeRollen(), this.repo.listeMappen(benutzer.id)]);
    return {
      typen, sichten: sichten.map((x) => ({ id: x.id, name: x.name, typen: x.typen })), rollen: rollen.map((r) => ({ id: r.id, name: r.name })),
      benutzer: leute.filter((m) => !alsListe(m.werte.rollen).some((r) => konto.has(r)) && !this.paketKonten.has(m.id)).map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), aktiv: m.werte.aktiv !== false })),
    };
  }

  /** Aktive Benutzer, die eine Rolle haben (Empfänger „Rolle“ einer Automatisierung). */
  async mitgliederDerRolle(rolleId: string): Promise<string[]> {
    const { benutzer } = await this.kern.system();
    return (await this.repo.listeMappen(benutzer.id)).filter((m) => m.werte.aktiv !== false && alsListe(m.werte.rollen).includes(rolleId)).map((m) => m.id);
  }

  /**
   * Teile einer Und-Bedingung für eine Mappe auswerten (#674): Bedingungen aus dem Baukasten der Ansichten,
   * „in Ansicht“ und „in den Favoriten von“. `ich` ist der Benutzer, für den „ich“ gilt (das Systemkonto).
   */
  async trifftTeile(mappeId: string, teile: Array<{ art: 'bedingungen'; bedingungen: Bedingung[] } | { art: 'sicht'; sicht: string } | { art: 'favorit'; benutzer: string[] }>, ich: string): Promise<boolean[]> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) return teile.map(() => false);
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) return teile.map(() => false);
    const a = await this.aufloesung(ich);
    let sichten: Sicht[] | null = null;
    const erg: boolean[] = [];
    for (const t of teile) {
      let klauseln: Klausel[];
      if (t.art === 'bedingungen') klauseln = [{ typen: [typ.id], filter: filterFuer({ bedingungen: t.bedingungen }, [typ], a) }];
      else if (t.art === 'sicht') { sichten ??= await this.repo.listeSichten(); klauseln = sichten.some((x) => x.id === t.sicht) ? klauselnFuer(sichten, t.sicht, new Map([[typ.id, typ]]), a) : []; }
      else klauseln = t.benutzer.map((b) => ({ typen: [typ.id], filter: [{ art: 'favorit' as const, benutzer: b }] }));
      erg.push(klauseln.length > 0 && (await this.repo.inKlauseln([m.id], klauseln)).has(m.id));
    }
    return erg;
  }

  /** Titel von Mappen, die `z` lesen darf (Platzhalter in Automatisierungen, #674); andere fehlen. */
  async lesbareTitel(z: Zugriff, ids: string[]): Promise<Map<string, string>> {
    const ok = await this.lesbare(z, ids);
    const t = await this.repo.titelVon([...ok]);
    return new Map([...t].filter(([k]) => ok.has(k)));
  }

  /** Mappen eines Typs, deren Datumsfeld genau dieses Datum hat („Datum in N Tagen“, #674). Nur Ids. */
  /** Wert eines Datumsfelds einer Mappe (#712: „Datum erreicht“ beim Speichern im Vorlauf); null ohne Datum oder bei Demo-Daten. */
  async datumVon(mappeId: string, feld: string): Promise<string | null> {
    const m = await this.repo.holeMappe(mappeId);
    const w = m?.werte[feld];
    return m && !m.demo && istDatum(w) ? w : null;
  }

  async mappenMitDatum(typId: string, feld: string, datum: string): Promise<string[]> {
    return (await this.repo.listeMappen(typId)).filter((m) => m.werte[feld] === datum && !m.demo).map((m) => m.id);
  }
}
