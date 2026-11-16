import type { Einstellungen } from './einstellungen';
import { protokoll } from './protokoll';
import { mitSpracheVon, t } from './sprache';
import { ortszeit } from './sicherung';
import { einstellungsMerker, laufeFaellige } from './zeitplan';
import { darfBereich, darfVerwalten, hatGesamt } from '../../shared/src/verwaltungsrecht';

const log = protokoll.modul('werkbank');

/**
 * Technische Aufgaben (#719): was die Verwaltung braucht – Sicherung, Pakete, Automatisierungen, Postfächer,
 * Speicherplatz … Seit #818/#819 gehen sie an die **Personen mit Verwaltungsrecht** für den passenden Werkbank-Bereich
 * (`Verwaltungspunkt.bereich`; ohne Bereich an „Gesamte Verwaltung“) – im Haushalt also meist an alle, die verwalten:
 *
 * - **E-Mail**, gebündelt je Person: höchstens eine je Tag (um `UHRZEIT`), nur wenn seit der letzten etwas Neues
 *   dazugekommen ist, und nur mit den Punkten ihrer Bereiche. Was ohnehin sofort eine eigene Mail schickt (Sicherung
 *   fehlgeschlagen oder zu alt, Speicherplatz, Notfallzugang – die „kritischen“), gilt mit Erscheinen als gemeldet; so
 *   kommt nichts doppelt. Entschieden als feste Meldung, nicht als mitgelieferte Automatisierung (#712): Diese Punkte
 *   hängen an keiner Mappe und an keinem Ereignis, Automatisierungen arbeiten aber mit Mappen und Ereignissen.
 * - **Hinweis ohne Einzelheiten** außerhalb des Verwaltungsmodus: nur „ja/nein“, nie Inhalte, mit dem Weg „Ablago
 *   verwalten“. Er verschwindet, sobald in den eigenen Bereichen nichts mehr offen ist.
 *
 * Mehrere Server: Der Tag der Sammel-Mail wird über den Zeitplan-Baustein beansprucht (genau ein Server schickt sie),
 * die schon gemeldeten Punkte liegen in der Datenbank (`verwaltung_gemeldet`).
 */
export interface Verwaltungspunkt {
  /** Fest je Sache (z. B. `paket:<id>`), damit er nur einmal gemeldet wird. */
  schluessel: string;
  /** Für die Mail an die Verwaltenden – nie für den Hinweis ohne Einzelheiten. */
  text: string;
  /** Werkbank-Bereich, zu dem der Punkt gehört (#818); fehlt er, geht er an „Gesamte Verwaltung“. */
  bereich?: string;
  /** Hat schon eine eigene, sofortige Mail an die Verwaltenden (Sicherung, Speicherplatz, Notfallzugang). */
  eigeneMail?: boolean;
}

/** Person, die eine Sammel-Mail bekommen kann. */
export interface Verwaltende {
  email: string;
  aktiv: boolean;
  verwaltung?: string[];
  art?: string;
  sprache?: string | null;
}
/** Gehört der Punkt zu den Bereichen dieser Person? */
export const fuerPerson = (b: Verwaltende, p: Verwaltungspunkt) => (p.bereich ? darfBereich(b, p.bereich) : hatGesamt(b));

export type Verwaltungsquelle = () => Promise<Verwaltungspunkt[]>;

/** Uhrzeit der täglichen Sammel-Mail (Zeitzone der Ablage). */
export const UHRZEIT = '07:00';
/** So lange gilt das Ergebnis für den Hinweis – er wird bei jedem Seitenaufruf gefragt. */
const MERKEN_MS = 60_000;

export interface VerwaltungDeps {
  /** Alle Quellen; eine, die scheitert, zählt als leer (der Rest gilt trotzdem). */
  quellen: Verwaltungsquelle[];
  einstellungen: Einstellungen;
  /** Alle Personen; die Mail bekommen die aktiven mit Verwaltungsrecht für die Bereiche der Punkte. */
  personen: () => Promise<Verwaltende[]>;
  /** Ohne eingerichteten Versand: nichts tun. */
  sende: (an: string, betreff: string, text: string) => Promise<void>;
  /** Adresse für den Link in die Werkbank. */
  adresse?: () => string;
  jetzt?: () => Date;
}

export class Verwaltung {
  private gemerkt: { am: number; punkte: Verwaltungspunkt[] } | null = null;
  private readonly jetzt: () => Date;
  constructor(private d: VerwaltungDeps) {
    this.jetzt = d.jetzt ?? (() => new Date());
  }

  /** Alle offenen technischen Punkte (sortiert nach Schlüssel). */
  async punkte(frisch = false): Promise<Verwaltungspunkt[]> {
    const t = this.jetzt().getTime();
    if (!frisch && this.gemerkt && t - this.gemerkt.am < MERKEN_MS) return this.gemerkt.punkte;
    const alle: Verwaltungspunkt[] = [];
    for (const q of this.d.quellen) {
      try {
        alle.push(...(await q()));
      } catch (e) {
        log.warn('Technische Aufgaben: eine Quelle ist nicht lesbar', { fehler: (e as Error).message });
      }
    }
    const punkte = [...new Map(alle.map((p) => [p.schluessel, p])).values()].sort((a, b) => a.schluessel.localeCompare(b.schluessel));
    this.gemerkt = { am: t, punkte };
    return punkte;
  }

  /** Für den Hinweis außerhalb des Verwaltungsmodus: Liegt in den Bereichen dieser Person etwas an? Nur ja/nein. */
  async offen(b?: Verwaltende): Promise<boolean> {
    return (await this.punkte()).some((p) => !b || fuerPerson(b, p));
  }

  /**
   * Regelmäßig aufrufen (etwa jede Minute): Vergessenes (erledigte Punkte) aufräumen, Punkte mit eigener Mail als
   * gemeldet merken und einmal am Tag die Sammel-Mail mit allem Neuen schicken. Liefert die Zahl gemailter Punkte.
   */
  async tick(): Promise<number> {
    const punkte = await this.punkte(true);
    const jetzt = new Set(punkte.map((p) => p.schluessel));
    const alt = await this.gemeldet();
    // Erledigtes vergessen – kommt es wieder, wird es wieder gemeldet; mit eigener Mail gilt es sofort als gemeldet.
    let neu = alt.filter((s) => jetzt.has(s));
    for (const p of punkte) if (p.eigeneMail && !neu.includes(p.schluessel)) neu.push(p.schluessel);
    neu = [...new Set(neu)].sort();
    if (neu.join('\n') !== alt.join('\n')) await this.d.einstellungen.schreibe('verwaltung_gemeldet', neu);
    let gemailt = 0;
    const offen = punkte.filter((p) => !neu.includes(p.schluessel));
    if (!offen.length) return 0;
    await laufeFaellige(
      einstellungsMerker(this.d.einstellungen, 'verwaltung_mail_tag'),
      ortszeit(this.jetzt()),
      { uhrzeit: UHRZEIT },
      async () => {
        const neuSchluessel = new Set(offen.map((p) => p.schluessel));
        let personen = 0;
        for (const b of await this.d.personen()) {
          if (!b.aktiv || !darfVerwalten(b) || !b.email || b.email.endsWith('.invalid')) continue;
          const seine = punkte.filter((p) => fuerPerson(b, p));
          const n = seine.filter((p) => neuSchluessel.has(p.schluessel)).length;
          if (!n) continue;
          try {
            const [bt, tx] = mitSpracheVon(b, () => [betreff(n), mailtext(seine, neuSchluessel, this.d.adresse?.())]);
            await this.d.sende(b.email, bt, tx);
            personen++;
          } catch (e) {
            log.warn('Technische Aufgaben: Mail nicht verschickt', { an: b.email, fehler: (e as Error).message });
          }
        }
        await this.d.einstellungen.schreibe('verwaltung_gemeldet', [...new Set([...neu, ...offen.map((p) => p.schluessel)])].sort());
        gemailt = offen.length;
        log.info('Technische Aufgaben an die Verwaltenden gemailt', { neu: offen.length, offen: punkte.length, personen });
      },
    );
    return gemailt;
  }

  private async gemeldet(): Promise<string[]> {
    const v = await this.d.einstellungen.lies('verwaltung_gemeldet');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').sort() : [];
  }
}

const betreff = (n: number) => t('mail.verwaltung.betreff', { anzahl: n });

function mailtext(punkte: Verwaltungspunkt[], neu: Set<string>, adresse?: string): string {
  const zeile = (p: Verwaltungspunkt) => `- ${p.text}${neu.has(p.schluessel) ? ` ${t('mail.verwaltung.neu')}` : ''}`;
  return (
    [
      t('mail.verwaltung.anrede'),
      t('mail.verwaltung.einleitung'),
      punkte.map(zeile).join('\n'),
      adresse ? t('mail.verwaltung.anmelden', { link: `${adresse.replace(/\/$/, '')}/werkbank` }) : t('mail.verwaltung.anmelden.ohne-link'),
      t('mail.verwaltung.fuss'),
    ].join('\n\n') + '\n'
  );
}
