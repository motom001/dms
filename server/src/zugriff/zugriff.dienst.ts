/**
 * Rechte prüfen (#1072, aus dienst.ts): Zugriff je Anfrage bilden (Menschen, Dienstkonten der Pakete, Systemkonten),
 * wirksame Rechte an Mappen, lesbare Mappen, Leserecht auf Zeit. Schicht 1 – bekommt den Kern, nicht den ganzen Dienst.
 */
import { randomUUID } from 'node:crypto';
import type { Aufgabe, Benutzer, Mappe, MappenBezug, Mappentyp } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { ALLE_TYPEN } from '../../../shared/src/pakete';
import { ALLES, FALSCH, hatKontoRegeln, kontoRegelwerk, lesefilter, NICHTS, oder, rechteAn as rechteAnMappe, wirksamVon, type Ausdruck, type Lesefilter, type Mappenquelle, type Recht, type Rechte, type Wer } from '../../../shared/src/rechte';
import { heuteIn, type Aufloesung } from '../../../shared/src/sichten';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { jeAnfrage } from '../lesespeicher';
import { rechteMessen } from '../messung';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';

const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
export const NICHT_SICHTBAR = t('meldungen.dienst.nicht-sichtbare-mappe');

/** Lesefilter um Leserechte auf Zeit erweitern (#798): je Mappentyp „oder die Mappe ist eine dieser“. */
function mitAufZeit(f: Lesefilter | null, typen: Mappentyp[], aufZeit: Array<{ mappeId: string; typId: string }>): Lesefilter | null {
  if (!f || !aufZeit.length) return f;
  const je = new Map<string, string[]>();
  for (const x of aufZeit) if (typen.some((t) => t.id === x.typId) && !f.offen.includes(x.typId)) je.set(x.typId, [...(je.get(x.typId) ?? []), x.mappeId]);
  if (!je.size) return f;
  const neu: Lesefilter = { offen: [...f.offen], je: f.je.map((e) => ({ ...e })) };
  for (const [typId, ids] of je) {
    const ausdruck: Ausdruck = { k: 'filter', f: { art: 'id', ids: [...new Set(ids)].sort() } };
    const e = neu.je.find((x) => x.typId === typId);
    if (e) e.ausdruck = oder(e.ausdruck, ausdruck); else neu.je.push({ typId, ausdruck });
  }
  return neu;
}
/** Titel nicht lesbarer Mappen ausblenden (#124); `ok`: die lesbaren. */
export function maskiert(b: Map<string, MappenBezug>, ok: Set<string>): Record<string, MappenBezug> {
  return Object.fromEntries([...b].map(([id, x]) => [id, ok.has(id) ? x : { titel: NICHT_SICHTBAR, typId: x.typId, verborgen: true }]));
}

/** Für die Rechte im Arbeitsspeicher (Regel „mit Aufgabe“): offene Aufgaben des Benutzers aus einer Liste. */
function quelleAus(benutzerId: string, aufgaben: Aufgabe[]): Mappenquelle {
  const mit = new Set(aufgaben.filter((x) => !x.erledigt && x.empfaengerId === benutzerId).map((x) => x.mappeId));
  return { dokumente: () => 0, verknuepfungen: () => 0, aufgabe: (id, b) => b === benutzerId && mit.has(id) };
}
const VERBOTEN: Record<Recht, string> = {
  C: t('meldungen.dienst.mappen-dieses-typs-darfst'),
  R: t('meldungen.dienst.diese-mappe-darfst-du'),
  U: t('meldungen.dienst.diese-mappe-darfst-du-2'),
  D: t('meldungen.dienst.diese-mappe-darfst-du-3'),
  P: t('meldungen.dienst.passwoerter-dieser-mappe-darfst'),
};

/** Was die Rechteprüfung außer dem Kern braucht – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface ZugriffAnschluss {
  /** KI-Dienste (#796): Ist dieser Mappentyp für das Paket gesperrt? (KI-Einstellung, noch im Dienst) */
  kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean>;
  /** Konten (vom Start verbunden): alle Benutzer für „Was sieht Benutzer X?“ und die Sicht anderer. */
  konten(): { benutzer?(): Promise<Benutzer[]> } | undefined;
}

export class ZugriffDienst {
  constructor(private readonly kern: Kern, private readonly anschluss: ZugriffAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined) { return this.anschluss.kiSperre(p); }
  private paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }
  private ablageortId(): Promise<string | undefined> { return this.kern.ablageortId(); }
  /** Unterscheidet zwei Dienste in derselben Anfrage (Tests mit zwei „Prozessen“). */
  private readonly kennung = randomUUID();

  /**
   * Wer greift zu, und was darf er lesen? Für Administratoren gelten die Regeln nicht (#128):
   * lesen = null (alles). Wird je Anfrage einmal gebildet.
   */
  async zugriff(ich: { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string }): Promise<Zugriff> {
    // Einmal je Anfrage (#741), nie über die Anfrage hinaus; nach einer Änderung in der Anfrage und in einer
    // Transaktion (sie sieht ihre eigenen Änderungen) neu.
    if (this.kern.inEigenerTransaktion()) return rechteMessen(() => this.bildeZugriff(ich));
    return jeAnfrage(`${this.kennung}|zugriff|${ich.id}|${ich.rolle}|${ich.art ?? ''}|${ich.paketId ?? ''}|${ich.systemkonto ?? ''}`, () => rechteMessen(() => this.bildeZugriff(ich)));
  }

  async bildeZugriff(ich: { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string }, o: { ohneAufZeit?: boolean } = {}): Promise<Zugriff> {
    const a = await this.aufloesung(ich.id);
    const typen = await this.repo.listeTypen();
    const admin = ich.rolle === 'admin' && !ich.art;
    if (ich.art) {
      // Konten, die kein Mensch sind (#673): ihre Rolle (Systemkonto bzw. Paket) statt der Rollen aus einer Benutzer-Mappe.
      const rolleId = (await this.kern.system()).kontorollen.get(ich.art === 'system' ? 'systemkonto' : 'paket')!;
      const wer: Wer = { id: ich.id, rollen: [rolleId] };
      if (ich.art === 'dienst') return this.paketZugriff(ich, a, wer, typen, rolleId);
      const eigene = typen.map((t) => kontoRegelwerk(t, rolleId));
      return { ich: { id: ich.id, rolle: 'mitglied' }, admin: false, wer, a, typen: new Map(eigene.map((t) => [t.id, t])), lesen: lesefilter(eigene, wer, a), systemkonto: ich.systemkonto ?? 'system' };
    }
    const wer: Wer = { id: ich.id, rollen: a.meineRollen };
    const lesen = admin ? null : lesefilter(typen, wer, a);
    // Leserecht auf Zeit (#798): nur für Menschen ohne Admin-Rechte, nur wenn die Regeln nicht ohnehin alles erlauben.
    const aufZeit = admin || !lesen || o.ohneAufZeit ? [] : await this.repo.leserechteAufZeit(ich.id);
    return {
      ich, admin, wer, a, typen: new Map(typen.map((t) => [t.id, t])), lesen: mitAufZeit(lesen, typen, aufZeit),
      ...(aufZeit.length ? { aufZeit: new Map(aufZeit.map((x) => [x.mappeId, { fallId: x.fallId, aufgabeId: x.aufgabeId, aufgabentext: x.aufgabentext, seit: x.seit, von: x.von }])) } : {}),
    };
  }

  /** Zugriff eines Dienstkontos (#338): nur die Typen und Rechte, die bei der Installation bestätigt wurden. */
  private async paketZugriff(ich: { id: string; rolle: string; paketId?: string }, a: Aufloesung, wer: Wer, typen: Mappentyp[], rolleId: string): Promise<Zugriff> {
    const pakete = await this.repo.listePakete();
    const p = pakete.find((x) => x.id === ich.paketId);
    const r = p?.laeufer?.rechte ?? { lesen: [], schreiben: [], dokumente: 'keine' as const };
    const aufloesen = await this.typverweise(p?.id ?? '', pakete, typen);
    // „Pakete“ am Mappentyp (#686): Der Admin kann einem Paket einzelne Mappentypen verwehren – dann sieht es sie gar nicht.
    const verwehrt = await this.paketVerwehrt();
    const lesbar = aufloesen(r.lesen);
    // KI-Dienste (#796): Ein KI-Paket sieht nur Mappentypen, die für KI-Dienste zugelassen sind – sonst gar nicht.
    const kiGesperrt = await this.kiSperre(p);
    const sichtbar = typen.filter((t) => lesbar.has(t.id) && !(p && verwehrt[t.id]?.includes(p.id)) && !kiGesperrt(t.id));
    // Regeln für die Rolle „Paket“ (#673) schränken die bestätigten Rechte weiter ein; ohne solche Regeln wie bisher.
    const mitRegeln = sichtbar.filter((t) => hatKontoRegeln(t, rolleId)).map((t) => kontoRegelwerk(t, rolleId));
    // Nie null („alles lesbar“): lesefilter() liefert null, wenn alle übergebenen Typen offen sind – hier sind das nur
    // die für das Paket sichtbaren. null hieße für Repo und lesbare() aber „alle Mappen aller Typen“.
    const offen = { offen: sichtbar.map((t) => t.id), je: [] };
    const lesen = mitRegeln.length ? lesefilter(sichtbar.map((t) => mitRegeln.find((x) => x.id === t.id) ?? kontoRegelwerk(t, rolleId)), wer, a) ?? offen : offen;
    return {
      ich: { id: ich.id, rolle: 'mitglied' }, admin: false, wer, a, typen: new Map(sichtbar.map((t) => [t.id, t])),
      lesen,
      paket: { id: p?.id ?? '', schreiben: aufloesen(r.schreiben), dokumente: r.dokumente, schnittstellen: r.schnittstellen ?? [], ...(mitRegeln.length ? { regeln: new Map(mitRegeln.map((t) => [t.id, t])) } : {}) },
    };
  }

  /**
   * Verweise auf Mappentypen aus einem Paket-Manifest (`code.rechte`, `code.mappentypen`) → Typ-Ids: eigener Schlüssel
   * ohne Präfix, `paket:typ`, `dms:ablageort|rolle|post` oder `*` (alle außer Benutzer). Unbekanntes fällt still weg.
   */
  async typverweise(paketId: string, pakete: InstalliertesPaket[], typen: Mappentyp[]): Promise<(liste: string[]) => Set<string>> {
    const dms = await this.kern.system();
    const ablageort = await this.ablageortId();
    return (liste) => {
      const ids = new Set<string>();
      for (const vw of liste) {
        if (vw === ALLE_TYPEN) { for (const t of typen) if (t.system !== 'benutzer') ids.add(t.id); continue; }
        const [pk, sl] = vw.includes(':') ? vw.split(':') : [paketId, vw];
        // Ohne Prüfung des Herausgebers (#1084): Eine Paket-Id gehört je Ablage genau einem Herausgeber – Installation
        // und Update derselben Id von einem anderen lehnt die Paketverwaltung ab, und Abhängigkeiten prüfen ihn. So
        // zeigt `paket:typ` immer auf das eine installierte Paket, dessen Herausgeber schon feststeht.
        // dms:benutzer lehnt liesCode ab; hier trotzdem nie auflösen (Pakete sehen keine Benutzer). dms:post seit #435.
        const id = pk === 'dms' ? (sl === 'ablageort' ? ablageort : sl === 'rolle' ? dms.rolle.id : sl === 'post' ? dms.post.id : null)
          : pakete.find((x) => x.id === pk)?.typen[sl];
        if (id) ids.add(id);
      }
      return ids;
    };
  }

  /** Wirksame Rechte an einer Mappe (Administrator: alles im Rahmen der Haken am Mappentyp). */
  /**
   * `aufgaben`: alle Aufgaben dieser Mappe, wenn sie schon gelesen sind (#615, „Mappe öffnen“) – dann fragt die
   * Regel „mit Aufgabe“ nicht noch einmal nach.
   */
  async rechteAn(z: Zugriff, m: Mappe, neu = false, aufgaben?: Aufgabe[]): Promise<Rechte> {
    return rechteMessen(() => this.rechteAnEine(z, m, neu, aufgaben));
  }

  private async rechteAnEine(z: Zugriff, m: Mappe, neu: boolean, aufgaben?: Aufgabe[]): Promise<Rechte> {
    const typ = z.typen.get(m.typId);
    if (!typ) return { ...NICHTS };
    if (z.admin) return wirksamVon(ALLES, typ);
    // Dienstkonto (#338): lesen, was bestätigt ist; anlegen/bearbeiten nur die Typen unter „schreiben“; nie löschen, nie Passwörter.
    if (z.paket) {
      const w = wirksamVon(ALLES, typ); const s = z.paket.schreiben.has(typ.id);
      const bestaetigt = { C: w.C && s, R: w.R, U: w.U && s, D: false, P: false };
      const regeln = z.paket.regeln?.get(typ.id);
      if (!regeln) return bestaetigt;
      // Regeln für die Rolle „Paket“ (#673): nur einschränken, nie über die bestätigten Rechte hinaus.
      const quelle = aufgaben && !neu ? quelleAus(z.wer.id, aufgaben.filter((x) => x.mappeId === m.id)) : await this.mappenquelle(z.wer.id, neu ? [] : [m.id]);
      const r = rechteAnMappe(regeln, m, z.wer, z.a, quelle, neu).wirksam;
      return { C: bestaetigt.C && r.C, R: bestaetigt.R && r.R, U: bestaetigt.U && r.U, D: false, P: false };
    }
    const quelle = aufgaben && !neu ? quelleAus(z.wer.id, aufgaben.filter((x) => x.mappeId === m.id)) : await this.mappenquelle(z.wer.id, neu ? [] : [m.id]);
    const r = rechteAnMappe(typ, m, z.wer, z.a, quelle, neu).wirksam;
    // Leserecht auf Zeit (#798): nur Lesen – Bearbeiten, Löschen und Passwörter bleiben, wie die Regeln sagen (ohne Lesen: nein).
    if (!r.R && !neu && z.aufZeit?.has(m.id)) return { ...r, R: true };
    // Systemkonto (#673): Passwörter sieht es nie (Platzhalter in Automatisierungen würden sie sonst hinaustragen).
    return z.systemkonto ? { ...r, P: false } : r;
  }

  /** Wie `rechteAn` für viele Mappen mit einem Zugriff (#367). */
  async rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> {
    return rechteMessen(() => this.rechteAnMehreren(z, ms));
  }

  private async rechteAnMehreren(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> {
    const r = new Map<string, Rechte>();
    if (z.admin) { for (const m of ms) { const typ = z.typen.get(m.typId); r.set(m.id, typ ? wirksamVon(ALLES, typ) : { ...NICHTS }); } return r; }
    // Dienstkonto (#338): wie in rechteAn, ohne Regeln.
    if (z.paket) { for (const m of ms) r.set(m.id, await this.rechteAnEine(z, m, false)); return r; }
    const quelle = await this.mappenquelle(z.wer.id, ms.map((m) => m.id));
    for (const m of ms) {
      const typ = z.typen.get(m.typId);
      const x = typ ? rechteAnMappe(typ, m, z.wer, z.a, quelle, false).wirksam : { ...NICHTS };
      // Leserecht auf Zeit (#798): wie in rechteAn.
      const y = !x.R && typ && z.aufZeit?.has(m.id) ? { ...x, R: true } : x;
      r.set(m.id, z.systemkonto ? { ...y, P: false } : y);
    }
    return r;
  }

  /** Für die Auswertung im Arbeitsspeicher: nur Aufgaben werden nachgeschlagen. */
  async mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> {
    return quelleAus(benutzerId, mappeIds.length ? await this.repo.offeneAufgaben({ benutzerId, mappeIds }) : []);
  }

  /** Mappe holen und ein Recht verlangen. Ohne Lesen: 404 (wer nichts sehen darf, erfährt nicht, dass es sie gibt). */
  async pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    if (!z) return m;
    const r = await this.rechteAn(z, m);
    if (!r.R) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es-2'), { verborgen: true });
    if (!r[recht]) throw new Fachfehler(403, VERBOTEN[recht]);
    return m;
  }

  /** Welche dieser Mappen darf der Benutzer lesen? */
  async lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> {
    if (!z || !z.lesen) return new Set(ids);
    return rechteMessen(() => this.repo.lesbare(ids, z.lesen!));
  }

  /** Titel nicht lesbarer Mappen ausblenden (#124). */
  async maskiereBezuege(z: Zugriff | undefined, b: Map<string, MappenBezug>): Promise<Record<string, MappenBezug>> {
    return maskiert(b, await this.lesbare(z, [...b.keys()]));
  }

  /** Welche dieser Mappen sieht ein (anderer) Benutzer? Unbekannte Benutzer (System): alle. */
  async sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await this.zugriff(b), ids);
  }

  /** „Was sieht Benutzer X?“ (#125): je Mappentyp gesamt und lesbar, dazu einige Titel. */
  async wasSieht(benutzerId: unknown) {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const z = await this.zugriff(b);
    const erg: Array<{ typId: string; name: string; gesamt: number; lesbar: number; beispiele: Array<{ id: string; titel: string }> }> = [];
    for (const t of [...z.typen.values()].sort((x, y) => x.name.localeCompare(y.name, 'de'))) {
      const gesamt = await this.repo.zaehleMappen(t.id);
      const lesbar = !z.lesen || z.lesen.offen.includes(t.id) ? gesamt : await this.repo.zaehleAusdruck(t.id, z.lesen.je.find((x) => x.typId === t.id)?.ausdruck ?? FALSCH);
      const seite: { mappen: Mappe[] } = lesbar ? await this.repo.seite({ typId: t.id, von: 0, anzahl: 10, lesen: z.lesen }) : { mappen: [] };
      erg.push({ typId: t.id, name: t.name, gesamt, lesbar, beispiele: seite.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '' })) });
    }
    return { admin: z.admin, typen: erg };
  }

  /** Zu welcher Mappe gehört ein Dokument, eine Notiz, eine Aufgabe? (für die Prüfung der Rechte) */
  async mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> {
    const x = !istUuid(id) ? undefined : art === 'dokument' ? await this.repo.holeDokument(id) : art === 'notiz' ? await this.repo.holeNotiz(id) : await this.repo.holeAufgabe(id);
    if (!x) throw new Fachfehler(404, art === 'dokument' ? t('meldungen.dienst.dieses-dokument-gibt-es') : art === 'notiz' ? t('meldungen.dienst.diese-notiz-gibt-es') : t('meldungen.dienst.diese-aufgabe-gibt-es'));
    return x.mappeId;
  }

  /** Klartext von Passwortfeldern nur dort, wo P gilt (#124). */
  async mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> {
    const mit: T[] = []; const ohne: T[] = [];
    // Gebündelt (#477): eine Abfrage für alle Mappen statt einer je Mappe.
    const r = await this.rechteAnVielen(z, mappen);
    for (const m of mappen) (r.get(m.id)?.P ? mit : ohne).push(m);
    return { mit, ohne };
  }

  /** Darf ein anderer Benutzer diese Mappe lesen? (Warnungen bei Aufgaben und Erwähnungen, #127) */
  async kannLesen(benutzerId: string, mappeId: string): Promise<boolean> {
    return (await this.sichtbarFuer(benutzerId, [mappeId])).has(mappeId);
  }

  /** Dynamische Werte für den angemeldeten Benutzer: heute, er selbst, seine Rollen. */
  async aufloesung(benutzerId: string): Promise<Aufloesung> {
    const bilde = async (): Promise<Aufloesung> => {
      const m = istUuid(benutzerId) ? await this.repo.holeMappe(benutzerId) : undefined;
      // Merkmale der Ablage (#1032) für Bedingungen in Rechten, Ansichten und Automatisierungen.
      return { heute: heuteIn(), ich: benutzerId, meineRollen: m ? alsListe(m.werte.rollen) : [], merkmale: await this.kern.merkmale() };
    };
    // Rollen einmal je Anfrage (#741) wie der Zugriff; jeder Aufrufer bekommt eine eigene Kopie.
    if (this.kern.inEigenerTransaktion()) return bilde();
    const a = await jeAnfrage(`${this.kennung}|rollen|${benutzerId}`, bilde);
    return { ...a, meineRollen: [...a.meineRollen], ...(a.merkmale ? { merkmale: { ...a.merkmale } } : {}) };
  }
}
