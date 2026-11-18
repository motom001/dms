/**
 * Ablago entdecken (#831, #832): Rundgänge und Tipps für die angemeldete Person.
 *
 * Ablagos eigene Rundgänge und Tipps liegen als YAML in `shared/entdecken/` (im Container unter
 * /app/shared/entdecken, siehe Dockerfile). Installierte Pakete bringen sie im selben Format mit (`inhalt.rundgaenge`,
 * `inhalt.tipps`, gespeichert am installierten Paket unter `entdecken`). Hier werden alle Quellen gelesen, geprüft
 * (`shared/src/entdecken.ts`) und je Person gefiltert: nach Verwaltungsrecht, eingeschalteten Funktionen und lesbaren
 * Mappentypen. Rundgänge aus Paketen heißen `<paket>:<schluessel>` – so kommen sich Pakete nicht in die Quere.
 *
 * Rundgänge aus Paketen starten nie von selbst: Mit `start: nach_installation`/`nach_update` bietet Ablago sie eine
 * Zeit lang als Tipp an („Verträge im Überblick – kurzer Rundgang“, höchstens ein Tipp am Tag).
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
  ANGEBOT_TAGE,
  anJederMappe,
  istNeu,
  oeffneTyp,
  pruefeAnker,
  pruefeRundgaenge,
  pruefeTipps,
  rundgangFuer,
  rundgangMerkerAus,
  startetVonSelbst,
  tippDesTages,
  tippHandlung,
  tippPasst,
  tippStandAus,
  type Anker,
  type EntdeckenStand,
  type Funktion,
  type Rundgang,
  type Texte,
  type Tipp,
  type TippAnzeige,
  type TypInfo,
} from '../../../shared/src/entdecken';
import { ausSchluessel } from '../../../shared/src/entdecken-werkbank';
import { paketGrundtexte, paketUebersetzung, type PaketTexte } from '../../../shared/src/entdecken-paket';
import { sprache } from '../../../shared/src/sprache';
import type { Benutzer } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { darfVerwalten } from '../../../shared/src/verwaltungsrecht';
import { eigeneRundgaenge, tippsMitWerkbank, werkbankAus } from './entdecken-werkbank';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';

/** Einstellungen der Person, unter denen Ablago sich Rundgänge und Tipps merkt. */
export const EINSTELLUNG = {
  rundgaenge: 'entdecken_rundgaenge',
  tipps: 'entdecken_tipps',
  version: 'entdecken_version',
  tippsAn: 'tipps',
} as const;
/** So viele Tipps merkt sich Ablago je Liste (gesehen, ausgeblendet) – die Einstellung bleibt klein. */
const MERKEN_MAX = 100;

/** Ordner mit anker.yaml, rundgaenge.yaml und tipps.yaml: vom Quelltext (src/entdecken/) bzw. von server/dist aus. */
export function entdeckenOrdner(): string | null {
  const hier = dirname(fileURLToPath(import.meta.url));
  const kandidaten = [
    process.env.DMS_ENTDECKEN_DIR,
    join(hier, '..', '..', 'shared', 'entdecken'),
    join(hier, '..', '..', '..', 'shared', 'entdecken'),
    join(process.cwd(), 'shared', 'entdecken'),
    join(process.cwd(), '..', 'shared', 'entdecken'),
  ];
  return kandidaten.find((k): k is string => !!k && existsSync(join(k, 'anker.yaml'))) ?? null;
}

/** Inhalt einer Quelle, geprüft. */
export interface Inhalt {
  anker: Anker[];
  rundgaenge: Rundgang[];
  tipps: Tipp[];
  fehler: string[];
}

const lies = (ordner: string, datei: string): unknown => {
  const p = join(ordner, datei);
  return existsSync(p) ? parse(readFileSync(p, 'utf8')) : null;
};

let ankerGelesen: Anker[] | null = null;
/**
 * Die Ankerliste (`anker.yaml`) – für die Prüfung beim Installieren eines Pakets (#831). Ohne Ordner (Tests ohne
 * shared/entdecken) leer: Dann lehnt die Prüfung jedes Ziel ab, statt still Falsches durchzulassen.
 */
export function ankerListe(): Anker[] {
  if (!ankerGelesen) {
    const o = entdeckenOrdner();
    ankerGelesen = o ? pruefeAnker(lies(o, 'anker.yaml')).anker : [];
  }
  return ankerGelesen;
}

/**
 * Mappentyp in einem Paket auflösen: ohne Präfix ein eigener Typ des Pakets (`vertrag` → `vertraege:vertrag`), sonst
 * die Kennung, wie sie dasteht. `typen`: was über die Typen bekannt ist (Kennung → Felder und Register).
 */
export function paketTyp(paket: string, roh: string, typen: (kennung: string) => TypInfo | null | undefined): TypInfo | null {
  const kennung = roh.includes(':') ? roh : `${paket}:${roh}`;
  return typen(kennung) ?? null;
}

/**
 * Texte eines Pakets in der Sprache der Anfrage (#1307): Übersetzung vor dem Text in der Datei, danach die Grundsprache
 * des Pakets.
 */
const paketTexteIn = (texte: PaketTexte | undefined) => ({
  uebersetzung: paketUebersetzung(texte, sprache()),
  texte: paketGrundtexte(texte),
});

/** Rundgänge eines installierten Pakets prüfen; Schlüssel bekommen den Präfix des Pakets. */
export function paketRundgaenge(
  p: Pick<InstalliertesPaket, 'id'>,
  roh: unknown,
  o: { anker: readonly Anker[]; typen: (kennung: string) => TypInfo | null | undefined; texte?: PaketTexte },
): { rundgaenge: Rundgang[]; fehler: string[] } {
  const r = pruefeRundgaenge(roh, {
    herkunft: `paket:${p.id}`,
    anker: o.anker,
    ...paketTexteIn(o.texte),
    typ: (x) => paketTyp(p.id, x, o.typen),
  });
  return {
    rundgaenge: r.rundgaenge.map((x) => ({ ...x, schluessel: `${p.id}:${x.schluessel}` })),
    fehler: r.fehler.map((f) => `${p.id}: ${f}`),
  };
}

/**
 * Tipps eines installierten Pakets prüfen; Schlüssel bekommen den Präfix des Pakets, `rundgang` meint einen Rundgang
 * desselben Pakets.
 */
export function paketTipps(
  p: Pick<InstalliertesPaket, 'id'>,
  roh: unknown,
  o: { anker: readonly Anker[]; rundgaenge: readonly string[]; typen: (kennung: string) => TypInfo | null | undefined; texte?: PaketTexte },
): { tipps: Tipp[]; fehler: string[] } {
  const x = pruefeTipps(roh, {
    herkunft: `paket:${p.id}`,
    anker: o.anker,
    rundgaenge: o.rundgaenge,
    ...paketTexteIn(o.texte),
    typ: (k) => paketTyp(p.id, k, o.typen),
  });
  return {
    tipps: x.tipps.map((y) => ({
      ...y,
      schluessel: `${p.id}:${y.schluessel}`,
      ...(y.rundgang ? { rundgang: `${p.id}:${y.rundgang}` } : {}),
    })),
    fehler: x.fehler.map((f) => `${p.id}: ${f}`),
  };
}

const TAG_MS = 24 * 3600 * 1000;
/** Liegt der Zeitpunkt höchstens {@link ANGEBOT_TAGE} zurück? */
const kuerzlich = (wann: string | null | undefined, jetzt: number) => !!wann && jetzt - Date.parse(wann) <= ANGEBOT_TAGE * TAG_MS;

/** Ablagos eigene Rundgänge und Tipps aus dem Ordner lesen und prüfen; `texte` liefert die Texte der Sprachdatei. */
export function ladeAblago(ordner: string, texte: Texte): Inhalt {
  const fehler: string[] = [];
  const anker = pruefeAnker(lies(ordner, 'anker.yaml'));
  fehler.push(...anker.fehler);
  const r = pruefeRundgaenge(lies(ordner, 'rundgaenge.yaml'), { herkunft: 'ablago', anker: anker.anker, texte });
  fehler.push(...r.fehler);
  const x = pruefeTipps(lies(ordner, 'tipps.yaml'), {
    herkunft: 'ablago',
    anker: anker.anker,
    rundgaenge: r.rundgaenge.map((y) => y.schluessel),
    texte,
  });
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
  /** Installierte Pakete (#831): ihre Rundgänge und Tipps stehen unter `entdecken`. Ohne: nur Ablagos eigene. */
  pakete?(): Promise<InstalliertesPaket[]>;
  /** Mappentypen mit Kennung, Feldern und Registern – zum Prüfen der Rundgänge aus Paketen. */
  typen?(): Promise<TypInfo[]>;
  /** Kennungen der Mappentypen, die die Person lesen darf; ohne gilt jeder als lesbar. */
  lesbareTypen?(b: Benutzer): Promise<ReadonlySet<string>>;
  /**
   * Was ein Rundgang öffnet (`oeffne.mappe`/`oeffne.neu`): Pfad der ersten Mappe dieses Typs, die die Person lesen
   * darf, bzw. des leeren Formulars, wenn sie den Typ anlegen darf – sonst null (dann gilt der Ersatztext). `typ` null
   * (#1307, Tipp an jeder Mappe): die zuletzt geänderte Mappe irgendeines Typs, die sie lesen darf.
   */
  oeffnen?(b: Benutzer, typ: string | null, art: 'mappe' | 'neu'): Promise<string | null>;
  /** Was die Werkbank gespeichert hat (#941, #942): eigene Rundgänge, ausgeschaltete Einträge. */
  werkbank?(): Promise<unknown>;
  /** Jetzt (Tests). */
  jetzt?(): number;
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

  /** Ablagos eigene Rundgänge und Tipps in der Sprache der Anfrage (je Sprache einmal gelesen). */
  ablago(): Inhalt {
    const spr = sprache();
    let x = this.inhalt.get(spr);
    if (!x) {
      x = this.ordner
        ? ladeAblago(this.ordner, sprachTexte)
        : { anker: [], rundgaenge: [], tipps: [], fehler: ['Ordner shared/entdecken nicht gefunden'] };
      this.inhalt.set(spr, x);
      // Fehlerhafte Einträge fallen weg; für die Person ändert das nichts, im Protokoll steht es einmal.
      if (x.fehler.length && !this.gemeldet) {
        this.gemeldet = true;
        this.o.log?.warn('Rundgänge und Tipps: fehlerhafte Einträge übergangen', { fehler: x.fehler.slice(0, 20) });
      }
    }
    return x;
  }

  /** Schon gemeldete Fehler der Pakete (je Paket und Version einmal ins Protokoll). */
  private readonly paketGemeldet = new Set<string>();

  /**
   * Alle Quellen: Ablago und die installierten Pakete. Ein Rundgang aus einem Paket mit `nach_installation` bzw.
   * `nach_update` kommt kurz nach Installation bzw. Update als Angebot unter die Tipps (`angebot:<rundgang>`, „neu“).
   */
  async quellen(o: { alle?: boolean } = {}): Promise<
    Inhalt & {
      neu: Map<string, boolean>;
      eigeneFehler: Map<string, string[]>;
      tippOriginale: Map<string, Tipp>;
      tippFehler: Map<string, string[]>;
    }
  > {
    const a = this.ablago();
    const neu = new Map<string, boolean>();
    const pakete = (await this.o.pakete?.()) ?? [];
    const w = werkbankAus(await this.o.werkbank?.());
    const eigeneFehler = new Map<string, string[]>();
    if (!pakete.some((p) => p.entdecken) && !w.rundgaenge.length && !w.tipps.length && !Object.keys(w.anpassungen).length && !w.aus.length)
      return { ...a, neu, eigeneFehler, tippOriginale: new Map(), tippFehler: new Map() };
    const typen = new Map(((await this.o.typen?.()) ?? []).map((x) => [x.kennung, x]));
    const rundgaenge = [...a.rundgaenge],
      tipps = [...a.tipps];
    const jetzt = this.o.jetzt?.() ?? Date.now();
    for (const p of pakete) {
      const x = this.paketQuelle(p, a.anker, (k) => typen.get(k), jetzt);
      rundgaenge.push(...x.rundgaenge);
      for (const [y, istNeuHier] of x.tipps) {
        tipps.push(y);
        neu.set(y.schluessel, istNeuHier);
      }
    }
    // Eigene Rundgänge aus der Werkbank (#941): nie von selbst, fehlerhafte fallen weg (die Werkbank zeigt sie).
    const eigene = eigeneRundgaenge(w, { anker: a.anker, typ: (k) => typen.get(k) ?? null });
    rundgaenge.push(...eigene.rundgaenge);
    for (const [k, f] of eigene.fehler) eigeneFehler.set(k, f);
    // Eigene Tipps und Anpassungen (#942).
    const mitW = tippsMitWerkbank(tipps, w, {
      anker: a.anker,
      rundgaenge: rundgaenge.map((r) => r.schluessel),
      typ: (k) => typen.get(k) ?? null,
    });
    // Ausgeschaltet (Werkbank): fällt für alle weg – samt Tipps, die einen solchen Rundgang starten.
    const aus = new Set(o.alle ? [] : w.aus);
    return {
      anker: a.anker,
      rundgaenge: rundgaenge.filter((r) => !aus.has(ausSchluessel('rundgang', r.schluessel))),
      tipps: mitW.tipps.filter((x) => !aus.has(ausSchluessel('tipp', x.schluessel))),
      fehler: a.fehler,
      neu,
      eigeneFehler,
      tippOriginale: mitW.originale,
      tippFehler: mitW.fehler,
    };
  }

  /** Fehler eines Pakets einmal je Version ins Protokoll – ein Paket für eine neuere Ablago-Version kann Anker nennen, die es hier nicht gibt. */
  private melde(p: InstalliertesPaket, art: string, fehler: string[]) {
    const k = `${p.id}@${p.version}:${art}`;
    if (!fehler.length || this.paketGemeldet.has(k)) return;
    this.paketGemeldet.add(k);
    this.o.log?.warn(`${art} eines Pakets übergangen`, { paket: p.id, fehler: fehler.slice(0, 20) });
  }

  /**
   * Rundgänge und Tipps eines Pakets, je Tipp, ob er „neu“ ist: Tipps mit ab_version nach einem Update darauf, Angebote
   * für Rundgänge mit nach_installation/nach_update – jeweils {@link ANGEBOT_TAGE} lang.
   */
  private paketQuelle(
    p: InstalliertesPaket,
    anker: readonly Anker[],
    typen: (k: string) => TypInfo | undefined,
    jetzt: number,
  ): { rundgaenge: Rundgang[]; tipps: Array<[Tipp, boolean]> } {
    if (!p.entdecken) return { rundgaenge: [], tipps: [] };
    const texte = p.entdecken.texte;
    const r = paketRundgaenge(p, p.entdecken.rundgaenge, { anker, typen, texte });
    this.melde(p, 'Rundgänge', r.fehler);
    const x = paketTipps(p, p.entdecken.tipps, {
      anker,
      rundgaenge: r.rundgaenge.map((y) => y.schluessel.slice(p.id.length + 1)),
      typen,
      texte,
    });
    this.melde(p, 'Tipps', x.fehler);
    const tipps: Array<[Tipp, boolean]> = x.tipps.map((y) => [
      y,
      kuerzlich(p.aktualisiert, jetzt) && istNeu(y, p.entdecken?.vorher ?? null, p.version),
    ]);
    for (const y of r.rundgaenge) {
      const wann =
        y.start === 'nach_installation' ? (p.aktualisiert ? null : p.installiert) : y.start === 'nach_update' ? p.aktualisiert : null;
      if (!kuerzlich(wann, jetzt)) continue;
      tipps.push([
        {
          schluessel: `angebot:${y.schluessel}`,
          herkunft: y.herkunft,
          bereich: 'mappen',
          text: t('entdecken.angebot', { titel: y.titel }),
          fuer: y.fuer,
          rundgang: y.schluessel,
        },
        true,
      ]);
    }
    return { rundgaenge: r.rundgaenge, tipps };
  }

  private async fuerwen(b: Benutzer, q: { rundgaenge: Rundgang[]; tipps: Tipp[] }) {
    // Lesbare Mappentypen nur holen, wenn ein Eintrag einen Mappentyp nennt.
    const mitTyp = q.rundgaenge.some((r) => oeffneTyp(r.oeffne)) || q.tipps.some((x) => x.typ);
    return {
      verwalten: b.rolle === 'admin' || darfVerwalten(b),
      funktionen: await this.o.funktionen(b),
      ...(mitTyp && this.o.lesbareTypen ? { lesbar: await this.o.lesbareTypen(b) } : {}),
    };
  }

  /**
   * Was die Person sehen darf, mit Tipp des Tages und dem Rundgang, der jetzt von selbst startet. In Vertretung
   * (#418) startet nichts von selbst und Ablago merkt sich nichts für die vertretene Person.
   */
  async stand(b: Benutzer, o: { vertretung?: boolean } = {}): Promise<EntdeckenStand> {
    const q = await this.quellen();
    const p = await this.fuerwen(b, q);
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
    // Tipps, die einen Rundgang starten, nur, wenn die Person ihn auch bekommt.
    const tipps: TippAnzeige[] = q.tipps
      .filter((x) => tippPasst(x, p) && (!x.rundgang || rundgaenge.some((r) => r.schluessel === x.rundgang)))
      .map((x) => {
        const a = x.ziel ? q.anker.find((y) => y.anker === x.ziel) : undefined;
        return {
          schluessel: x.schluessel,
          herkunft: x.herkunft,
          bereich: x.bereich,
          text: x.text,
          ...(a?.seite
            ? { ziel: { anker: a.anker, seite: a.seite } }
            : x.ziel && x.typ
              ? { ziel: { anker: x.ziel, typ: x.typ } }
              : x.ziel && anJederMappe(x.ziel)
                ? { ziel: { anker: x.ziel } }
                : {}),
          ...(x.rundgang ? { rundgang: x.rundgang } : {}),
          neu: q.neu.get(x.schluessel) ?? istNeu(x, vorher, jetzt),
          ausgeblendet: aus.has(x.schluessel),
          clients: x.rundgang ? false : !!a?.clients,
        };
      });
    const tippsAn = e[EINSTELLUNG.tippsAn] !== false;
    const heute = tippsAn ? tippDesTages(tipps, stand, this.o.heute()) : null;
    const merker = rundgangMerkerAus(e[EINSTELLUNG.rundgaenge]);
    const starten = o.vertretung ? null : (rundgaenge.find((r) => startetVonSelbst(r, merker, b.letzteAnmeldung))?.schluessel ?? null);
    return {
      rundgaenge,
      tipps,
      tipp: heute
        ? { schluessel: heute.tipp.schluessel, weitere: heute.weitere, gesehen: (stand.gesehen ?? []).includes(heute.tipp.schluessel) }
        : null,
      tippsAn,
      starten,
    };
  }

  /** Tipp gezeigt, angeklickt (erledigt), mit × ausgeblendet oder auf „Ablago entdecken“ wieder eingeblendet. */
  async tipp(b: Benutzer, schluessel: string, aktion: unknown): Promise<void> {
    if (aktion !== 'gezeigt' && aktion !== 'erledigt' && aktion !== 'ausblenden' && aktion !== 'einblenden')
      throw new Fachfehler(422, t('meldungen.entdecken.aktion'));
    if (!(await this.quellen()).tipps.some((x) => x.schluessel === schluessel)) throw new Fachfehler(404, t('meldungen.entdecken.tipp'));
    const e = await this.o.einstellungen(b);
    const neu = tippHandlung(tippStandAus(e[EINSTELLUNG.tipps]), schluessel, aktion, this.o.heute());
    await this.o.setzeEinstellung(b, EINSTELLUNG.tipps, {
      ...neu,
      gesehen: (neu.gesehen ?? []).slice(-MERKEN_MAX),
      aus: (neu.aus ?? []).slice(-MERKEN_MAX),
    });
  }

  /** Rundgang gesehen (Fertig, Überspringen) oder „Später“ (wieder bei der nächsten Anmeldung). */
  async rundgang(b: Benutzer, schluessel: string, stand: unknown): Promise<void> {
    if (stand !== 'gesehen' && stand !== 'spaeter') throw new Fachfehler(422, t('meldungen.entdecken.stand'));
    if (!(await this.quellen()).rundgaenge.some((r) => r.schluessel === schluessel))
      throw new Fachfehler(404, t('meldungen.entdecken.rundgang'));
    const e = await this.o.einstellungen(b);
    const merker = rundgangMerkerAus(e[EINSTELLUNG.rundgaenge]);
    // „gesehen“ bleibt gesehen: Wer den Rundgang über „Ablago entdecken“ noch einmal startet und „Später“ wählt, bekommt ihn nicht wieder von selbst.
    if (stand === 'spaeter' && merker[schluessel]?.stand === 'gesehen') return;
    merker[schluessel] = { stand, am: new Date().toISOString() };
    await this.o.setzeEinstellung(b, EINSTELLUNG.rundgaenge, merker);
    this.o.log?.debug(`Rundgang „${schluessel}“: ${stand}`);
  }

  /** „Ausprobieren“ eines Tipps (#942): erste Mappe dieses Typs (null: irgendeines Typs, #1307), die die Person lesen darf, sonst null. */
  async mappeVonTyp(b: Benutzer, typ: string | null): Promise<string | null> {
    return (await this.o.oeffnen?.(b, typ, 'mappe')) ?? null;
  }

  /**
   * „Ausprobieren“ in der Werkbank (#941): ein ungespeicherter Rundgang, wie diese Person ihn sähe, und was er vorher
   * öffnet. Ändert nichts für andere.
   */
  async probe(b: Benutzer, r: Rundgang): Promise<{ rundgang: Rundgang | null; pfad: string | null }> {
    const fuer = rundgangFuer(r, await this.fuerwen(b, { rundgaenge: [r], tipps: [] }));
    const o = r.oeffne;
    const pfad =
      fuer && o && !('seite' in o)
        ? ((await this.o.oeffnen?.(b, 'mappe' in o ? o.mappe : o.neu, 'mappe' in o ? 'mappe' : 'neu')) ?? null)
        : null;
    return { rundgang: fuer, pfad };
  }

  /**
   * Was ein Rundgang vor dem ersten Schritt öffnet (`oeffne.mappe`/`oeffne.neu`): Pfad oder null (dann zeigt die
   * Oberfläche den Ersatztext). Nur für Rundgänge, die die Person bekommt; andere gelten als unbekannt.
   */
  async oeffnen(b: Benutzer, schluessel: string, art: 'rundgang' | 'tipp' = 'rundgang'): Promise<{ pfad: string | null }> {
    const s = await this.stand(b, { vertretung: true });
    if (art === 'tipp') {
      const x = s.tipps.find((y) => y.schluessel === schluessel);
      if (!x) throw new Fachfehler(404, t('meldungen.entdecken.tipp'));
      if (!x.ziel || x.ziel.seite) return { pfad: x.ziel?.seite ?? null };
      return { pfad: (await this.o.oeffnen?.(b, x.ziel.typ ?? null, 'mappe')) ?? null };
    }
    const r = s.rundgaenge.find((x) => x.schluessel === schluessel);
    if (!r) throw new Fachfehler(404, t('meldungen.entdecken.rundgang'));
    const o = r.oeffne;
    if (!o || 'seite' in o) return { pfad: null };
    return { pfad: (await this.o.oeffnen?.(b, 'mappe' in o ? o.mappe : o.neu, 'mappe' in o ? 'mappe' : 'neu')) ?? null };
  }
}
