import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { KONTOROLLEN, kontorolleKennung, ROLLEN, systemrolleKennung, type Kontorolle, type Mappentyp, type Rolle } from '../../../shared/src/model';
import type { Aufloesung } from '../../../shared/src/sichten';
import type { Lesefilter, Wer } from '../../../shared/src/rechte';
import type { PaketCode, Schnittstelle } from '../../../shared/src/pakete';
import { EREIGNISKATALOG, mischeFelder, type Ausloeser as EreignisAusloeser, type KatalogArt, type Katalogeintrag } from '../../../shared/src/ereignisse';
import type { Dateispeicher } from '../dateispeicher';
import type { Einstellungen } from '../einstellungen';
import type { Repo } from '../repo';
import type { Haushaltsstand } from '../zaehlerspeicher';
import { beiVerklemmungWiederholen } from '../db';
import { kontext, protokoll } from '../protokoll';
import { t } from '../sprache';
import { Anlaesse } from './anlaesse';
import { Historie } from './historie';
import { Loeschprotokoll } from './loeschprotokoll';

/** Laufende Transaktion je Aufruf (#404): Repo der Transaktion und was erst nach dem Speichern geschehen soll. */
const transaktionen = new AsyncLocalStorage<{ kern: object; repo: Repo; nachher: Array<() => void> }>();
/**
 * Ereigniskatalog (#670): Wer gerade handelt (z. B. eine Automatisierung, #674) bzw. ob gerade gar nichts ausgelöst
 * werden soll (Import, Beispiel-Mappen, Wiederherstellung).
 */
const ereignisKontext = new AsyncLocalStorage<{ ausloeser?: EreignisAusloeser; still?: boolean }>();
export const PAPIERKORB_STANDARD_TAGE = 30;
/** Ereignisse, nach denen eine Mappe unter „Zuletzt geöffnet“ nach oben rückt (#940: Anlegen und Ändern zählen). */
const ZULETZT_ARTEN = new Set<KatalogArt>(['mappe.angelegt', 'mappe.geaendert', 'dokument.hochgeladen', 'mappe.notiz']);

/** Zugriff eines Benutzers (#124): Rollen, Auflösung dynamischer Werte, Lesefilter (null = alles). */
export interface Zugriff {
  ich: { id: string; rolle: string };
  admin: boolean;
  wer: Wer;
  a: Aufloesung;
  typen: Map<string, Mappentyp>;
  lesen: Lesefilter | null;
  /**
   * Dienstkonto eines Pakets (#338): Rechte fest aus dem bestätigten Manifest statt aus Regeln.
   * typen enthält dann nur die lesbaren Typen; schreiben = Ids der Typen mit Anlegen/Bearbeiten.
   */
  paket?: { id: string; schreiben: Set<string>; dokumente: PaketCode['rechte']['dokumente']; schnittstellen?: Schnittstelle[];
    /** Typen mit Regeln für die Rolle „Paket“ (#673), schon auf diese Regeln zugeschnitten – sie schränken die bestätigten Rechte weiter ein. */
    regeln?: Map<string, Mappentyp> };
  /** Systemkonto (#673), z. B. „Automatisierung“: Rechte aus den Regeln für die Rolle „Systemkonto“ (typen sind darauf zugeschnitten). */
  systemkonto?: string;
  /**
   * Leserecht auf Zeit (#798) je Mappe: vom Admin für die Dauer einer Aufgabe gegeben. Nur Lesen, nur diese Mappe,
   * nur solange die Aufgabe offen bei dieser Person liegt – steht schon im Lesefilter (`lesen`).
   */
  aufZeit?: Map<string, LeserechtAufZeit>;
}
/** Ein wirksames Leserecht auf Zeit (#798): Grund ist die Aufgabe; von = der Admin, der es gegeben hat. */
export interface LeserechtAufZeit { fallId: string; aufgabeId: string; aufgabentext: string; seit: string; von: string | null }

/** Wer zugreift (#124, #338, #673): Mensch, Dienstkonto eines Pakets oder Systemkonto. */
export interface Zugreifender { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string }

/** Systemtypen und -rollen (#26, #27, #435, #673): Benutzer, Rolle, Post und die Ids der festen Rollen. */
export interface SystemIds { benutzer: Mappentyp; rolle: Mappentyp; post: Mappentyp; systemrollen: Map<Rolle, string>; kontorollen: Map<Kontorolle, string> }

/** Was der Kern beim Zusammenbau bekommt (vom Dienst). */
export interface KernOptionen {
  /** Das Repo außerhalb jeder Transaktion (schon mit dem Haushaltsstand umhüllt). */
  repo: Repo;
  dateien: Dateispeicher;
  einstellungen?: Einstellungen;
  stand: Haushaltsstand;
  /** Verteiler des Ereigniskatalogs wecken (ereignisse.ts). */
  wecke: () => void;
  /**
   * Rückfall (#963): die Systemausstattung anlegen, wenn beim Nachschlagen etwas fehlt – für Wege ohne Start (Tests,
   * Wiederherstellung, Demo entfernen). Beim Start legt sie `systemausstattung.sicherstellen()` ausdrücklich an.
   */
  ausstatten: () => Promise<void>;
  /** Zugriff bilden (Schicht „zugriff“, `zugriff/` – der Kern bindet sie nicht ein, der Dienst reicht sie herein). */
  zugriff: (ich: Zugreifender) => Promise<Zugriff>;
}

/**
 * Der Kern (#961): was alle Fachbereiche brauchen – Repo und Transaktion, Arbeit nach der Antwort, Ereignisse in den
 * Ausgangskorb, Anschlusspunkte für das Sofortige (#962), Systemtypen nachschlagen, Historie und Löschprotokoll
 * schreiben. Er ruft keinen Fachbereich auf.
 */
export class Kern {
  readonly dateien: Dateispeicher;
  readonly einstellungen?: Einstellungen;
  readonly stand: Haushaltsstand;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt. */
  paketKonten = new Map<string, string>();
  /** Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern durch eine Person (vom Start gesetzt: Konten merken es). */
  beiEigenerAenderung?: (benutzerId: string, mappeId: string) => Promise<void>;
  /** Historie der Mappen schreiben (#57). */
  readonly historie = new Historie(this);
  /** Löschprotokoll schreiben (#470). */
  readonly loeschprotokoll = new Loeschprotokoll(this);
  /** Anschlusspunkte (#962): was sofort, in derselben Transaktion, zu einer Änderung gehört (`kern/anlaesse.ts`). */
  readonly anlaesse = new Anlaesse(() => this.inEigenerTransaktion());
  /**
   * Das Repo außerhalb jeder Transaktion – auch während `inTransaktion` läuft. Nur für das, was über Transaktionen hinweg
   * gilt und nie zu einer Änderung gehört: Zwischenspeicher (Vektoren der Suche), den Ereignisverteiler, Nachläufe im
   * Hintergrund. Alles andere nimmt `repo`: Es sieht, was die laufende Transaktion schon geändert hat, und rollt mit ihr
   * zurück.
   */
  readonly repoOhneTransaktion: Repo;
  private readonly wecke: () => void;
  private readonly ausstatten: () => Promise<void>;
  private readonly zugriffBilden: (ich: Zugreifender) => Promise<Zugriff>;

  constructor(o: KernOptionen) {
    this.repoOhneTransaktion = o.repo;
    this.dateien = o.dateien;
    this.einstellungen = o.einstellungen;
    this.stand = o.stand;
    this.wecke = o.wecke;
    this.ausstatten = o.ausstatten;
    this.zugriffBilden = o.zugriff;
  }

  /* ---------- Repo und Transaktion (#404) ---------- */

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion. */
  get repo(): Repo {
    const t = transaktionen.getStore();
    return t?.kern === this ? t.repo : this.repoOhneTransaktion;
  }

  /** Läuft gerade eine Transaktion dieses Kerns? */
  inEigenerTransaktion(): boolean { return transaktionen.getStore()?.kern === this; }

  /**
   * Änderungen samt Ereignissen ganz oder gar nicht (#404). Verschachtelt läuft alles in der äußeren
   * Transaktion. Nur Datenbank-Arbeit hineinlegen: Dateien schreiben vorher, Anstöße (Vorschau,
   * Texterkennung, Läufer) mit `danach`.
   */
  async inTransaktion<T>(f: () => Promise<T>): Promise<T> {
    if (transaktionen.getStore()?.kern === this) return f();
    const nachher: Array<() => void> = [];
    const erg = await this.repoOhneTransaktion.transaktion((repo) => transaktionen.run({ kern: this, repo, nachher }, f));
    for (const n of nachher) n();
    return erg;
  }

  /**
   * Wie `inTransaktion`; bricht PostgreSQL die eigene Transaktion wegen einer Verklemmung ab (#575), noch einmal von
   * vorn (#743). In einer äußeren Transaktion nicht – die ist dann ohnehin verloren.
   */
  async inEinemZug<T>(f: () => Promise<T>): Promise<T> {
    if (transaktionen.getStore()?.kern === this) return f();
    return beiVerklemmungWiederholen(() => this.inTransaktion(f));
  }

  /** Läuft das in einer HTTP-Anfrage, die Arbeit nach der Antwort annimmt (#928)? */
  inAnfrage(): boolean { return !!kontext.getStore()?.nachAntwort; }

  /**
   * Nach der Antwort (#928, über den Nachlauf von #741): Arbeit, die nicht zur Antwort gehört und auch nicht zu dem, was
   * die Person gleich danach sieht. Ohne Anfrage (Tests, Hintergrund, Automatisierungen) gleich – dann wird gewartet.
   * Erst nach dem Speichern einer Transaktion; wird sie zurückgerollt, nie. Fehler nur im Protokoll.
   */
  nachDerAntwort(f: () => Promise<unknown>): Promise<void> | void {
    const k = kontext.getStore();
    if (!k?.nachAntwort) return f().then(() => undefined);
    const liste = k.nachAntwort;
    this.danach(() => { if (!liste.includes(f)) liste.push(f); });
  }

  /** Verteiler des Ereigniskatalogs wecken – in einer Anfrage erst nach der Antwort (#928), einmal je Anfrage. */
  private readonly weckeVerteiler = async () => { this.wecke(); };

  /** Nach dem Speichern (bzw. sofort ohne Transaktion); bei Zurückrollen nie. */
  danach(f: () => void) {
    const t = transaktionen.getStore();
    if (t?.kern === this) t.nachher.push(f); else f();
  }

  /* ---------- Dateien ---------- */

  async liesGanz(sha256: string): Promise<Buffer> {
    const x = await this.dateien.lies(sha256);
    return Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]);
  }

  /* ---------- Nachschlagen ---------- */

  /** Anzeigename eines Benutzers (auch für Platzhalter in Automatisierungen, #678). */
  async name(benutzerId: string | null): Promise<string> {
    if (!benutzerId) return t('meldungen.dienst.ohne-empfaenger');
    return (await this.repo.titelVon([benutzerId])).get(benutzerId) || 'unbekannt';
  }

  /** Wer was lesen darf – einmal je Anfrage gebildet (#741); die Fachbereiche reichen ihn weiter. */
  zugriff(ich: Zugreifender): Promise<Zugriff> { return this.zugriffBilden(ich); }

  /** Alle Mappentypen nach Id (aus dem Repo, in einer Transaktion deren Stand). */
  async typen(): Promise<Map<string, Mappentyp>> { return new Map((await this.repo.listeTypen()).map((x) => [x.id, x] as const)); }

  /** Typ einer Mappe für ein Ereignis (null, wenn es sie nicht mehr gibt). */
  async typVon(mappeId: string): Promise<string | null> { return (await this.repo.holeMappe(mappeId))?.typId ?? null; }

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig). */
  async papierkorbTage(): Promise<number> {
    if (!this.einstellungen) return 0;
    const e = (await this.einstellungen.lies('papierkorb')) as { tage?: number } | null;
    return typeof e?.tage === 'number' ? e.tage : PAPIERKORB_STANDARD_TAGE;
  }

  /** Je Mappentyp-Id die Pakete, denen der Admin diesen Typ verwehrt hat (Einstellung, Teil der Sicherung). */
  async paketVerwehrt(): Promise<Record<string, string[]>> {
    const v = await this.einstellungen?.lies('paket_verwehrt');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => Array.isArray(x)).map(([k, x]) => [k, (x as unknown[]).map(String)]));
  }

  /** Id des Ablageorts (#168, #883): von Basis mitgebracht, sonst der frühere des Kerns – nur nachschlagen. */
  async ablageortId(): Promise<string | undefined> {
    const basis = (await this.repo.listePakete()).find((p) => p.id === 'basis')?.typen.ablageort;
    if (basis && (await this.repo.holeTyp(basis))) return basis;
    return (await this.frueherAblageortTyp())?.id;
  }

  /**
   * Der Ablageort, den der Kern vor #883 angelegt hat – solange ihn kein Paket übernommen hat. Gemerkt über seine Id in
   * den Einstellungen (ohne Einstellungen, z. B. in Tests: über die Kennung `ablageort`).
   */
  async frueherAblageortTyp(): Promise<Mappentyp | undefined> {
    const merk = (await this.einstellungen?.lies('ablageort')) as { id?: string } | null | undefined;
    const id = merk?.id ?? (this.einstellungen ? undefined : (await this.repo.listeTypen()).find((t) => !t.system && t.schluessel === 'ablageort')?.id);
    if (!id || (await this.repo.listePakete()).some((p) => Object.values(p.typen).includes(id))) return undefined;
    return this.repo.holeTyp(id);
  }

  /** Ids der Systemausstattung, einmal nachgeschlagen (nur außerhalb einer Transaktion gemerkt). */
  private systemIds?: Promise<SystemIds>;

  /**
   * Die Systemtypen „Benutzer“, „Rolle“ und „Post“ und die Systemrollen nachschlagen (#963) – legt nichts an. Fehlt
   * etwas, legt es der Rückfall `ausstatten` an (Wege ohne Start); gleichzeitige Aufrufe teilen sich einen Lauf.
   * Gemerkt werden nur Ids, die außerhalb einer Transaktion nachgeschlagen wurden: Was eine Transaktion selbst anlegt,
   * kann noch zurückgerollt werden.
   */
  system(): Promise<SystemIds> {
    const ids = this.systemIds ?? this.schlageSystemNach();
    if (!this.systemIds && !this.inEigenerTransaktion()) this.systemIds = ids.catch((e: unknown) => { this.systemIds = undefined; throw e; });
    return ids.then(async (s) => ({
      // Definitionen können sich seitdem geändert haben (Felder ergänzt, umbenannt).
      benutzer: (await this.repo.holeTyp(s.benutzer.id)) ?? s.benutzer,
      rolle: (await this.repo.holeTyp(s.rolle.id)) ?? s.rolle,
      post: (await this.repo.holeTyp(s.post.id)) ?? s.post,
      systemrollen: s.systemrollen,
      kontorollen: s.kontorollen,
    }));
  }

  /** Gemerkte Ids vergessen – nach dem Anlegen der Systemausstattung (#963). */
  vergissSystem(): void { this.systemIds = undefined; }

  private async schlageSystemNach(): Promise<SystemIds> {
    const da = await this.findeSystem();
    if (da) return da;
    await this.ausstatten();
    const neu = await this.findeSystem();
    if (!neu) throw new Error('Systemausstattung unvollständig: Systemtypen oder Systemrollen fehlen nach dem Anlegen');
    return neu;
  }

  /** Systemtypen und Systemrollen, wie sie in der Datenbank stehen; null, wenn etwas fehlt. */
  private async findeSystem(): Promise<SystemIds | null> {
    const typen = await this.repo.listeTypen();
    const [benutzer, rolle, post] = (['benutzer', 'rolle', 'post'] as const).map((x) => typen.find((t) => t.system === x));
    if (!benutzer || !rolle || !post) return null;
    const systemrollen = new Map<Rolle, string>();
    for (const r of Object.keys(ROLLEN) as Array<keyof typeof ROLLEN>) {
      const m = await this.repo.holeSystemMappe(systemrolleKennung(r));
      if (!m) return null;
      systemrollen.set(r, m.id);
    }
    const kontorollen = new Map<Kontorolle, string>();
    for (const r of Object.keys(KONTOROLLEN) as Kontorolle[]) {
      const m = await this.repo.holeSystemMappe(kontorolleKennung(r));
      if (!m) return null;
      kontorollen.set(r, m.id);
    }
    return { benutzer, rolle, post, systemrollen, kontorollen };
  }

  /* ---------- Ereigniskatalog (#670) ---------- */

  /** `f` im Namen eines bestimmten Auslösers ausführen (#674: eine Automatisierung handelt; Ketten zählen mit). */
  mitAusloeser<T>(a: EreignisAusloeser, f: () => Promise<T>): Promise<T> { return ereignisKontext.run({ ...ereignisKontext.getStore(), ausloeser: a }, f); }
  /** `f` ohne Ereignisse ausführen (Import, Beispiel-Mappen, Wiederherstellung – „lösen nichts aus“). */
  ohneEreignisse<T>(f: () => Promise<T>): Promise<T> { return ereignisKontext.run({ ...ereignisKontext.getStore(), still: true }, f); }
  /** Wer gerade handelt – aus dem Kontext oder aus dem Konto `von`. */
  ausloeser(von: string | null | undefined): EreignisAusloeser {
    const k = ereignisKontext.getStore()?.ausloeser;
    if (k) return k;
    if (!von) return { art: 'system', id: null, konto: null };
    const paket = this.paketKonten.get(von);
    return paket ? { art: 'paket', id: paket, konto: von } : { art: 'benutzer', id: von, konto: von };
  }

  /**
   * Ein Ereignis des Katalogs (#670) in den Ausgangskorb – in der Transaktion der Änderung, sofern es eine gibt
   * (dann scheitert beides zusammen), sonst gleich danach; Fehler außerhalb einer Transaktion landen nur im Protokoll.
   * Nur Ids, Typ, Feldschlüssel und Datum. Demo-Mappen und alles in `ohneEreignisse` lösen nichts aus.
   */
  async ereignis(art: KatalogArt, daten: Record<string, unknown>, von?: string | null): Promise<void> {
    const k = EREIGNISKATALOG[art] as Katalogeintrag;
    // Still (Demo, Beispiele, Import): nur was Pakete an Dateien verarbeiten (Volltext, Vektoren) – wie vor #724.
    const still = !!ereignisKontext.getStore()?.still;
    if (still && (!k.paket || k.mappentyp)) return;
    const inTx = transaktionen.getStore()?.kern === this;
    const ausloeser = this.ausloeser(von);
    const mappe = typeof daten.mappe === 'string' ? daten.mappe : null;
    // „Zuletzt geöffnet“ (#940): Was eine Person selbst anlegt oder ändert, zählt wie geöffnet – nach der Antwort.
    const merken = this.beiEigenerAenderung;
    if (merken && mappe && !still && ausloeser.art === 'benutzer' && ausloeser.id && ZULETZT_ARTEN.has(art)) {
      const benutzerId = ausloeser.id;
      await this.nachDerAntwort(() => merken(benutzerId, mappe).catch((e) => protokoll.modul('ereignisse').warn('„Zuletzt geöffnet“ nicht gemerkt', { fehler: (e as Error).message })));
    }
    try {
      await this.repo.legeKatalogEreignisAn({
        id: randomUUID(), art, daten, ausloeser: { ...ausloeser, ...(still ? { still: true } : {}) },
        ...(k.buendelS && mappe ? { buendel: `${art}|${mappe}`, buendelS: k.buendelS } : {}),
      }, k.buendelS ? (alt) => mischeFelder(alt, daten) : undefined);
      // #928: Der Verteiler (Automatisierungen, Pakete, Webhooks) teilte sich sonst Datenbank und Rechenzeit mit der
      // Anfrage, die das Ereignis auslöst; das Ereignis steht schon im Ausgangskorb.
      if (this.inAnfrage()) void this.nachDerAntwort(this.weckeVerteiler);
      else this.danach(() => this.wecke());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('ereignisse').error('Ereignis nicht gespeichert', { art, fehler: (e as Error).message });
    }
  }
}
