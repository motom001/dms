/**
 * Aufgaben ohne Empfänger an einen Alltags-Benutzer (#719, #818) und Favoriten benachrichtigen (#422, #506; #1078 aus
 * dienst.ts). Schicht 3 – Teile und Anschluss wie `AufgabenDienst` (aufgaben.dienst.ts).
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import { ABO_ARTEN, type Kern } from '../kern';
import { jeAnfrage } from '../lesespeicher';
import type { MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { Benutzer } from '../../../shared/src/model';
import { zeitzone } from '../../../shared/src/region';
import { gebietsschema } from '../../../shared/src/sprache';
import type { AufgabenAnschluss, AufgabenTeile } from './aufgaben.dienst';
import type { AufgabenVertretung } from './vertretung';

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
/**
 * Alltags-Benutzer für Aufgaben ohne Empfänger (#719): aktiver Mensch. Seit #818 auch eine Person mit Verwaltungsrecht –
 * sie arbeitet im Alltag mit demselben Konto.
 */
export const taugtAlsAufgabenEmpfaenger = (b: Benutzer) => b.aktiv && !b.art;

export class OhneEmpfaenger {
  constructor(private readonly kern: Kern, private readonly teile: AufgabenTeile, private readonly anschluss: AufgabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private get einstellungen() { return this.kern.einstellungen; }
  private get stand() { return this.kern.stand; }
  private kannLesen(benutzerId: string, mappeId: string) { return this.teile.rechte.kannLesen(benutzerId, mappeId); }
  private persoenlichAn(benutzerId: string, schluessel: string) { return this.teile.mappen.persoenlichAn(benutzerId, schluessel); }
  private empfaengerAufloesen(id: string | null) { return this.teile.vertretung.empfaengerAufloesen(id); }
  private benachrichtigeGebuendelt(...a: Parameters<AufgabenVertretung['benachrichtigeGebuendelt']>) { return this.teile.vertretung.benachrichtigeGebuendelt(...a); }
  /** Regeln aus den Automatisierungen (#1001); ohne Motor: für alle, Vorgabe an. */
  private async favoritenRegeln(): Promise<Array<{ rollen: string[]; vorgabe: boolean }>> {
    const lies = async () => (await this.anschluss.favoritenRegeln?.()) ?? [{ rollen: [], vorgabe: true }];
    // Einmal je Anfrage: Profil, Favoritenliste und Benachrichtigen fragen es je Person.
    return this.kern.inEigenerTransaktion() ? lies() : [...await jeAnfrage(`${this.kennung}|favoritenregeln`, lies)];
  }
  private async rollenVon(benutzerId: string): Promise<string[]> { return alsListe((await this.repo.holeMappe(benutzerId))?.werte.rollen); }

  /** Unterscheidet zwei Dienste in derselben Anfrage (Tests mit zwei „Prozessen“). */
  private readonly kennung = randomUUID();

  /**
   * Wer im Alltag die Aufgaben ohne Empfänger bekommt (Aufgaben ohne Empfänger, Post ohne „Für“, Fristen ohne
   * Zuständige) – zusätzlich zu den Administratoren. Nur aktive Menschen ohne Admin-Rechte; passt der gespeicherte
   * Benutzer nicht mehr (deaktiviert, Administrator geworden), gilt niemand, bis die Werkbank einen neuen wählt.
   * `gesetzt`: Die Einstellung wurde schon einmal gespeichert (auch „niemand“) – dann setzt Ablago keine Vorgabe mehr.
   */
  async alltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    // Einmal je Anfrage (#741): Zahlen, Termine und Eingang fragen es mehrfach; braucht die Liste aller Personen.
    if (this.kern.inEigenerTransaktion()) return this.bildeAlltagsEmpfaenger();
    return { ...await jeAnfrage(`${this.kennung}|alltag`, () => this.bildeAlltagsEmpfaenger()) };
  }

  private async bildeAlltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    const e = (await this.einstellungen?.lies('aufgaben_empfaenger')) as { benutzer?: unknown } | null;
    const gespeichert = typeof e?.benutzer === 'string' ? e.benutzer : null;
    if (!gespeichert) return { benutzerId: null, wirksam: null, gesetzt: !!e, gespeichert: null };
    const alle = (await this.konten?.benutzer?.()) ?? [];
    const b = alle.find((x) => x.id === gespeichert);
    // Abwesend oder deaktiviert: wie jede Aufgabe beim Vertreter (#78) – sofern er sie bekommen darf.
    const { ziel } = b ? await this.empfaengerAufloesen(b.id) : { ziel: null };
    const z = alle.find((x) => x.id === ziel);
    return { benutzerId: b && taugtAlsAufgabenEmpfaenger(b) ? b.id : null, wirksam: z && taugtAlsAufgabenEmpfaenger(z) ? z.id : null, gesetzt: true, gespeichert };
  }

  /** Werkbank → Benutzer und Sicherheit (#719): Alltags-Benutzer wählen oder `null` (nur im Verwaltungsmodus). */
  async setzeAufgabenEmpfaenger(eingabe: unknown, von: string | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const id = (eingabe as { benutzerId?: unknown } | null)?.benutzerId ?? null;
    if (id !== null) {
      const b = typeof id === 'string' ? (await this.konten?.benutzer?.())?.find((x) => x.id === id) : undefined;
      if (!b) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.unbekannt'));
      if (!taugtAlsAufgabenEmpfaenger(b)) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.inaktiv'));
    }
    await this.einstellungen.schreibe('aufgaben_empfaenger', { benutzer: id });
    await this.stand.erhoehe();
    protokoll.modul('werkbank').info('Empfänger für Aufgaben ohne Empfänger eingestellt', { von: await this.name(von), an: id ? await this.name(id as string) : 'nur im Verwaltungsmodus' });
    return this.alltagsEmpfaenger();
  }

  /** Sieht dieser Benutzer die Aufgaben ohne Empfänger (#719)? Im Verwaltungsmodus immer, sonst nur der gewählte Alltags-Benutzer. */
  async siehtOhneEmpfaenger(ich: { id: string; rolle: string }): Promise<boolean> {
    if (ich.rolle === 'admin') return true;
    return (await this.alltagsEmpfaenger()).wirksam === ich.id;
  }

  /** Erster Mensch (#719): Vorgabe, solange die Werkbank noch nichts gewählt hat. */
  async vorgabeAufgabenEmpfaenger(b: Benutzer) {
    if (!this.einstellungen || !taugtAlsAufgabenEmpfaenger(b) || (await this.alltagsEmpfaenger()).gesetzt) return;
    const neu = { benutzer: b.id };
    if (this.einstellungen.tausche ? await this.einstellungen.tausche('aufgaben_empfaenger', null, neu) : (await this.einstellungen.schreibe('aufgaben_empfaenger', neu), true)) {
      await this.stand.erhoehe();
      protokoll.modul('werkbank').info('Aufgaben ohne Empfänger gehen an den ersten Benutzer', { an: b.name || b.email });
    }
  }

  /**
   * Bekommt dieser Benutzer Benachrichtigungen zu Favoriten (#506; seit #1001 aus den Automatisierungen)? Ja, wenn eine
   * eingeschaltete Automatisierung „Favoriten-Änderungen melden“ ihn erreicht – ohne Rollen-Auswahl alle, sonst die
   * Mitglieder der gewählten Rollen (Rollen aus seiner Benutzer-Mappe). Ohne eine solche Automatisierung niemand.
   */
  async favoritenBenachrichtigungErlaubt(benutzerId: string): Promise<boolean> {
    const regeln = await this.favoritenRegeln();
    if (regeln.some((r) => !r.rollen.length)) return true;
    if (!regeln.length) return false;
    const meine = new Set(await this.rollenVon(benutzerId));
    return regeln.some((r) => r.rollen.some((x) => meine.has(x)));
  }

  /** Vorgabe für neue Benutzer (#506, seit #1001 in der Automatisierung): an, solange keine Automatisierung „aus“ sagt. */
  async favoritenVorgabe(): Promise<boolean> {
    const regeln = await this.favoritenRegeln();
    return !regeln.length || regeln.some((r) => r.vorgabe);
  }

  /**
   * Hat jemand eine Mappe geändert, die andere als Favorit haben, bekommen die – sofern sie es nicht abgeschaltet
   * haben und die Mappe lesen dürfen – **eine** Aufgabe „Geändert“. Solange sie offen ist, zählt sie nur hoch
   * („3 Änderungen von Anna und Paul seit 01.11.“); erst nach dem Öffnen der Mappe oder „Erledigt“ kommt wieder eine.
   * Eigene Änderungen benachrichtigen nie.
   */
  async favoritenMelden(mappeId: string, von: string, rollen: string[] = []): Promise<number> {
    const fav = (await this.repo.favoritenDerMappe(mappeId)).filter((f) => f.benachrichtigen && f.benutzerId !== von);
    if (!fav.length) return 0;
    let n = 0;
    const aktiv = this.konten?.benutzer ? new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)) : null;
    for (const { benutzerId } of fav) {
      if (aktiv && !aktiv.has(benutzerId)) continue;
      if (!(await this.persoenlichAn(benutzerId, 'favoriten_benachrichtigen'))) continue;
      if (!(await this.kannLesen(benutzerId, mappeId))) continue;
      // Nur an Mitglieder der gewählten Rollen (#1001, früher die Freigabe in der Werkbank).
      if (rollen.length && !(await this.rollenVon(benutzerId)).some((r) => rollen.includes(r))) continue;
      n++;
      await this.benachrichtigeGebuendelt({
        empfaengerId: benutzerId, mappeId, art: 'aenderung', schluessel: 'aenderung', von,
        text: async (bisher) => {
          const seit = bisher?.erstellt ?? '';
          const h = (await this.repo.historie(mappeId)).filter((x) => x.zeit > seit && x.benutzerId && x.benutzerId !== benutzerId
            && (ABO_ARTEN as readonly string[]).includes(x.art) && x.daten?.aufgabenart !== 'aenderung');
          // Die erste Änderung steht vor der Aufgabe in der Historie; ihr Urheber ist erstelltVon der Aufgabe.
          const n = bisher ? 1 + h.length : 1;
          const namen = [...new Set(bisher ? [bisher.erstelltVon ?? von, ...h.map((x) => x.benutzerId!)] : [von])];
          const liste = await Promise.all(namen.slice(0, 3).map((id) => this.name(id)));
          const wer = namen.length > 3 ? t('meldungen.dienst.und-weiteren', { liste: liste.join(', ') }) : liste.length > 1 ? `${liste.slice(0, -1).join(', ')} und ${liste.at(-1)}` : liste[0];
          const tag = new Date(bisher?.erstellt || Date.now()).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', timeZone: zeitzone() });
          return t('meldungen.dienst.aenderungen-von-seit', { anzahl: n, wer, tag });
        },
      });
    }
    return n;
  }
}
