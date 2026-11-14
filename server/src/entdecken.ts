/**
 * Ablago entdecken (#831, #832): Rundgänge und Tipps für die angemeldete Person.
 *
 * Ablagos eigene Rundgänge und Tipps liegen als YAML in `shared/entdecken/` (im Container unter
 * /app/shared/entdecken, siehe Dockerfile) – im selben Format, das Pakete später mitbringen. Hier werden sie gelesen,
 * geprüft (`shared/src/entdecken.ts`) und je Person gefiltert: nach Verwaltungsrecht und eingeschalteten Funktionen.
 * Pakete fügen später nur eine weitere Quelle hinzu (`quellen`).
 *
 * Was die Person gesehen, ausgeblendet oder auf „Später“ gestellt hat, merkt sich Ablago in ihren Einstellungen
 * (`entdecken_rundgaenge`, `entdecken_tipps`, `entdecken_version`; Tipp-Zeile aus: `tipps` = false). Das bleibt in
 * der eigenen Ablago – keine Telemetrie, nichts geht nach außen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  istNeu, pruefeAnker, pruefeRundgaenge, pruefeTipps, rundgangFuer, rundgangMerkerAus, startetVonSelbst, tippDesTages, tippHandlung, tippPasst, tippStandAus,
  type Anker, type EntdeckenStand, type Funktion, type Rundgang, type Texte, type Tipp, type TippAnzeige,
} from '../../shared/src/entdecken';
import { sprache } from '../../shared/src/sprache';
import type { Benutzer } from '../../shared/src/model';
import { darfVerwalten } from '../../shared/src/verwaltungsrecht';
import { Fachfehler } from './fehler';
import { t } from './sprache';

/** Einstellungen der Person, unter denen Ablago sich Rundgänge und Tipps merkt. */
export const EINSTELLUNG = { rundgaenge: 'entdecken_rundgaenge', tipps: 'entdecken_tipps', version: 'entdecken_version', tippsAn: 'tipps' } as const;
/** So viele Tipps merkt sich Ablago je Liste (gesehen, ausgeblendet) – die Einstellung bleibt klein. */
const MERKEN_MAX = 100;

/** Ordner mit anker.yaml, rundgaenge.yaml und tipps.yaml: neben dem Quelltext bzw. neben server/dist. */
export function entdeckenOrdner(): string | null {
  const hier = dirname(fileURLToPath(import.meta.url));
  const kandidaten = [process.env.DMS_ENTDECKEN_DIR, join(hier, '..', '..', 'shared', 'entdecken'), join(process.cwd(), 'shared', 'entdecken'), join(process.cwd(), '..', 'shared', 'entdecken')];
  return kandidaten.find((k): k is string => !!k && existsSync(join(k, 'anker.yaml'))) ?? null;
}

/** Inhalt einer Quelle, geprüft. */
export interface Inhalt { anker: Anker[]; rundgaenge: Rundgang[]; tipps: Tipp[]; fehler: string[] }

const lies = (ordner: string, datei: string): unknown => {
  const p = join(ordner, datei);
  return existsSync(p) ? parse(readFileSync(p, 'utf8')) : null;
};

/** Ablagos eigene Rundgänge und Tipps aus dem Ordner lesen und prüfen; `texte` liefert die Texte der Sprachdatei. */
export function ladeAblago(ordner: string, texte: Texte): Inhalt {
  const fehler: string[] = [];
  const anker = pruefeAnker(lies(ordner, 'anker.yaml'));
  fehler.push(...anker.fehler);
  const r = pruefeRundgaenge(lies(ordner, 'rundgaenge.yaml'), { herkunft: 'ablago', anker: anker.anker, texte });
  fehler.push(...r.fehler);
  const x = pruefeTipps(lies(ordner, 'tipps.yaml'), { herkunft: 'ablago', anker: anker.anker, rundgaenge: r.rundgaenge.map((y) => y.schluessel), texte });
  fehler.push(...x.fehler);
  return { anker: anker.anker, rundgaenge: r.rundgaenge, tipps: x.tipps, fehler };
}

/** Texte aus `entdecken.json` in der Sprache der Anfrage. */
export const sprachTexte: Texte = (k) => (t.hat(k) ? t.frei(k) : undefined);

export interface EntdeckenOptionen {
  einstellungen(b: Benutzer): Promise<Record<string, unknown>>;
  setzeEinstellung(b: Benutzer, k: string, w: unknown): Promise<void>;
  /** Laufende Version von Ablago (für „Neu seit deinem letzten Besuch“). */
  version(): string;
  /** Heute in der Zeitzone der Region (JJJJ-MM-TT). */
  heute(): string;
  /** Eingeschaltete Funktionen für diese Person. */
  funktionen(b: Benutzer): Promise<ReadonlySet<Funktion>>;
  ordner?: string | null;
  log?: { warn(m: string, d?: Record<string, unknown>): void; debug(m: string, d?: Record<string, unknown>): void };
}

export class Entdecken {
  private readonly ordner: string | null;
  /** Geprüfter Inhalt je Sprache (die Texte hängen an der Sprache). */
  private readonly inhalt = new Map<string, Inhalt>();
  private gemeldet = false;

  constructor(private readonly o: EntdeckenOptionen) {
    this.ordner = o.ordner === undefined ? entdeckenOrdner() : o.ordner;
  }

  /** Alle Quellen in der Sprache der Anfrage: heute nur Ablago selbst, später dazu die installierten Pakete. */
  quellen(): Inhalt {
    const spr = sprache();
    let x = this.inhalt.get(spr);
    if (!x) {
      x = this.ordner ? ladeAblago(this.ordner, sprachTexte) : { anker: [], rundgaenge: [], tipps: [], fehler: ['Ordner shared/entdecken nicht gefunden'] };
      this.inhalt.set(spr, x);
      // Fehlerhafte Einträge fallen weg; für die Person ändert das nichts, im Protokoll steht es einmal.
      if (x.fehler.length && !this.gemeldet) { this.gemeldet = true; this.o.log?.warn('Rundgänge und Tipps: fehlerhafte Einträge übergangen', { fehler: x.fehler.slice(0, 20) }); }
    }
    return x;
  }

  private async fuerwen(b: Benutzer) {
    return { verwalten: b.rolle === 'admin' || darfVerwalten(b), funktionen: await this.o.funktionen(b) };
  }

  /**
   * Was die Person sehen darf, mit Tipp des Tages und dem Rundgang, der jetzt von selbst startet. In Vertretung
   * (#418) startet nichts von selbst und Ablago merkt sich nichts für die vertretene Person.
   */
  async stand(b: Benutzer, o: { vertretung?: boolean } = {}): Promise<EntdeckenStand> {
    const q = this.quellen();
    const p = await this.fuerwen(b);
    const e = await this.o.einstellungen(b);
    const rundgaenge = q.rundgaenge.map((r) => rundgangFuer(r, p)).filter((r): r is Rundgang => !!r);
    // Version (#832): beim ersten Mal und nach jedem Update merken, welche die Person davor benutzt hat.
    const jetzt = this.o.version();
    const v = e[EINSTELLUNG.version] as { vorher?: string | null; jetzt?: string } | undefined;
    let vorher = v?.vorher ?? null;
    if (!v || v.jetzt !== jetzt) {
      vorher = v?.jetzt ?? jetzt;
      if (!o.vertretung) await this.o.setzeEinstellung(b, EINSTELLUNG.version, { vorher, jetzt });
    }
    const stand = tippStandAus(e[EINSTELLUNG.tipps]);
    const aus = new Set(stand.aus);
    const tipps: TippAnzeige[] = q.tipps.filter((x) => tippPasst(x, p)).map((x) => {
      const a = x.ziel ? q.anker.find((y) => y.anker === x.ziel) : undefined;
      return {
        schluessel: x.schluessel, herkunft: x.herkunft, bereich: x.bereich, text: x.text,
        ...(a?.seite ? { ziel: { anker: a.anker, seite: a.seite } } : {}), ...(x.rundgang ? { rundgang: x.rundgang } : {}),
        neu: istNeu(x, vorher, jetzt), ausgeblendet: aus.has(x.schluessel), clients: x.rundgang ? false : !!a?.clients,
      };
    });
    const tippsAn = e[EINSTELLUNG.tippsAn] !== false;
    const heute = tippsAn ? tippDesTages(tipps, stand, this.o.heute()) : null;
    const merker = rundgangMerkerAus(e[EINSTELLUNG.rundgaenge]);
    const starten = o.vertretung ? null : rundgaenge.find((r) => startetVonSelbst(r, merker, b.letzteAnmeldung))?.schluessel ?? null;
    return { rundgaenge, tipps, tipp: heute ? { schluessel: heute.tipp.schluessel, weitere: heute.weitere, gesehen: (stand.gesehen ?? []).includes(heute.tipp.schluessel) } : null, tippsAn, starten };
  }

  /** Tipp gezeigt, angeklickt (erledigt), mit × ausgeblendet oder auf „Ablago entdecken“ wieder eingeblendet. */
  async tipp(b: Benutzer, schluessel: string, aktion: unknown): Promise<void> {
    if (aktion !== 'gezeigt' && aktion !== 'erledigt' && aktion !== 'ausblenden' && aktion !== 'einblenden') throw new Fachfehler(422, t('meldungen.entdecken.aktion'));
    if (!this.quellen().tipps.some((x) => x.schluessel === schluessel)) throw new Fachfehler(404, t('meldungen.entdecken.tipp'));
    const e = await this.o.einstellungen(b);
    const neu = tippHandlung(tippStandAus(e[EINSTELLUNG.tipps]), schluessel, aktion, this.o.heute());
    await this.o.setzeEinstellung(b, EINSTELLUNG.tipps, { ...neu, gesehen: (neu.gesehen ?? []).slice(-MERKEN_MAX), aus: (neu.aus ?? []).slice(-MERKEN_MAX) });
  }

  /** Rundgang gesehen (Fertig, Überspringen) oder „Später“ (wieder bei der nächsten Anmeldung). */
  async rundgang(b: Benutzer, schluessel: string, stand: unknown): Promise<void> {
    if (stand !== 'gesehen' && stand !== 'spaeter') throw new Fachfehler(422, t('meldungen.entdecken.stand'));
    if (!this.quellen().rundgaenge.some((r) => r.schluessel === schluessel)) throw new Fachfehler(404, t('meldungen.entdecken.rundgang'));
    const e = await this.o.einstellungen(b);
    const merker = rundgangMerkerAus(e[EINSTELLUNG.rundgaenge]);
    // „gesehen“ bleibt gesehen: Wer den Rundgang über „Ablago entdecken“ noch einmal startet und „Später“ wählt, bekommt ihn nicht wieder von selbst.
    if (stand === 'spaeter' && merker[schluessel]?.stand === 'gesehen') return;
    merker[schluessel] = { stand, am: new Date().toISOString() };
    await this.o.setzeEinstellung(b, EINSTELLUNG.rundgaenge, merker);
    this.o.log?.debug(`Rundgang „${schluessel}“: ${stand}`);
  }
}
