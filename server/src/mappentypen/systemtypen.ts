/**
 * Systemtypen (#26, #27, #192, #1073 aus dienst.ts): Rolle, Benutzer und Post samt Systemfeldern, Beschriftungen und
 * Systemrollen – der Schritt der Mappentypen in der Systemausstattung (#963); dazu Benutzer-Mappen für die
 * Benutzerverwaltung, weitere Rollen, Ablageort und die Spur im Verwaltungsmodus (#820). Schicht 2.
 */
import { randomUUID } from 'node:crypto';
import {
  REGISTERNAMEN, SYSTEMTYPEN, ROLLEN, FRUEHERE_ADMINROLLE, type Modusspur, KONTOROLLEN, kontorolleKennung, type Kontorolle, freierSchluessel, systemfelder, systemBeschriftung, systemrolleKennung, verweiseVon,
  type Benutzer, type Feld, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, trefferlistenVon, standardliste, type Werte,
} from '../../../shared/src/model';
import { ergaenzeBeschriftungen, type NamensTeile, type TypTeile } from '../../../shared/src/beschriftung';
import { inSprache } from '../../../shared/src/sprache';
import { Fachfehler } from '../fehler';
import type { BenutzerGespiegelt, Kern, Zugreifender, Zugriff } from '../kern';
import type { Kurzzustand } from '../kurzzustand';
import { protokoll } from '../protokoll';
import type { Repo, Rueckverweis } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { mitBeschriftungen, mitSystemBeschriftung } from './eingabe';

/** Post (#192): Beschreibung und Spalten der Standard-Trefferliste. */
const POST_BESCHREIBUNG = t('meldungen.dienst.alles-was-in-ablago');
const POST_SPALTEN = ['datum', 'stand', 'kanal', 'von'];

const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Dieselbe fremde Mappe im Verwaltungsmodus innerhalb so vieler Minuten nur einmal in der Historie (#820). */
export const MODUSSPUR_MINUTEN = 10;
/** Arten im Kurzzustand (#744). */
const MODUSSPUR = 'modusspur';

/** Für die Benutzerverwaltung: Benutzer-Mappen anlegen, nachziehen und entfernen. */
export interface Benutzerspiegel {
  /** Legt die Mappe des Benutzers an oder zieht sie nach (Name, E-Mail, Systemrolle, aktiv). */
  aktualisiere(b: Benutzer, von?: string | null, abwesenheit?: BenutzerGespiegelt['abwesenheit']): Promise<void>;
  /** Entfernt die Mappe; wirft, wenn noch etwas auf sie verweist. */
  entferne(id: string): Promise<void>;
  /** Ist der Papierkorb an (#43)? Dann wird ein Benutzer deaktiviert und seine Mappe kommt in den Papierkorb. */
  papierkorbAn?(): Promise<boolean>;
  /** Legt die Mappe in den Papierkorb; wirft, wenn noch etwas auf sie verweist. */
  inPapierkorb?(id: string, von: string | null): Promise<void>;
  /** Anzahl offener Aufgaben eines Benutzers (ohne die der Administratoren) – Deaktivieren nur ohne (#77). */
  offeneAufgaben?(id: string): Promise<number>;
  /** Alle offenen Aufgaben eines Benutzers an einen anderen geben (#78); Anzahl. */
  aufgabenUebergeben?(id: string, an: string, von: string | null): Promise<number>;
}

/** Was die Systemtypen außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht. */
export interface SystemtypenAnschluss {
  /** Eine Mappe schreiben, die das System pflegt (Mappen, noch im Dienst). */
  schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung?: string | null): Promise<Mappe>;
  /** Mappe endgültig löschen (Löschen, noch im Dienst). */
  loescheMappeIntern(id: string, typ: Mappentyp | undefined, von?: string | null): Promise<void>;
  /** Benutzer-Mappe nachziehen bzw. Aufgaben übergeben (Benutzerverwaltung, noch im Dienst). */
  spiegleBenutzer(b: Benutzer, von: string | null, abwesenheit?: BenutzerGespiegelt['abwesenheit']): Promise<void>;
  aufgabenUebergeben(id: string, an: string, von: string | null): Promise<number>;
  /** Kurzzustand (#744) für „kurz hintereinander nur einmal“. */
  kurzzustand(): Kurzzustand;
}

export class Systemtypen {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst, private readonly anschluss: SystemtypenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get kurzzustand() { return this.anschluss.kurzzustand(); }
  private ablageortId(): Promise<string | undefined> { return this.kern.ablageortId(); }
  private zugriff(ich: Zugreifender): Promise<Zugriff> { return this.rechtepruefung.zugriff(ich); }
  private lesbare(z: Zugriff | undefined, ids: string[]) { return this.rechtepruefung.lesbare(z, ids); }
  private schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung: string | null = null) { return this.anschluss.schreibeSystemMappe(typ, id, eingabe, von, kennung); }
  private loescheMappeIntern(id: string, typ: Mappentyp | undefined) { return this.anschluss.loescheMappeIntern(id, typ); }
  private spiegleBenutzer(b: Benutzer, von: string | null, abwesenheit?: BenutzerGespiegelt['abwesenheit']) { return this.anschluss.spiegleBenutzer(b, von, abwesenheit); }
  private aufgabenUebergeben(id: string, an: string, von: string | null) { return this.anschluss.aufgabenUebergeben(id, an, von); }
  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) { return this.kern.historie.schreibe(mappeId, benutzerId, art, daten); }

  /**
   * Ablageort (#168, #883): Seit #883 bringt ihn das Paket Basis mit (`basis:ablageort`); der Kern legt keinen mehr an.
   * Ältere Ablagen haben noch den Ablageort, den der Kern früher anlegte – Basis übernimmt ihn beim Installieren bzw.
   * Aktualisieren mit gleicher Id. Ohne Basis und ohne früheren Ablageort gibt es keinen (gewollt). `dms:ablageort` in
   * Paketen zeigt eine Zeit lang auf diesen Typ (Alias).
   */
  async ablageortTyp(): Promise<Mappentyp | undefined> {
    const id = await this.ablageortId();
    return id ? this.repo.holeTyp(id) : undefined;
  }

  /**
   * Systemausstattung, Schritt der Mappentypen (#963): Systemtypen „Rolle“, „Benutzer“ und „Post“ (#26, #27, #192)
   * samt Systemfeldern und Beschriftungen, Systemrollen und Kontorollen; `neu` = die eben angelegten Typen (ihre
   * Ansichten legt danach die Systemausstattung an).
   */
  async sichereSystemtypen(): Promise<{ post: Mappentyp; neu: Mappentyp[] }> {
    const neu: Mappentyp[] = [];
    const typen = await this.repo.listeTypen();
    let rolle = typen.find((t) => t.system === 'rolle');
    let benutzer = typen.find((t) => t.system === 'benutzer');
    let post = typen.find((t) => t.system === 'post');
    const frei = (name: string) => (typen.some((t) => t.name.trim().toLowerCase() === name.toLowerCase()) ? `${name} (System)` : name);
    // Feste Schlüssel der Systemtypen (#145): benutzer, rolle, post.
    const sk = (k: string) => freierSchluessel(k, typen.map((t) => t.schluessel ?? ''));
    const ids = { rolle: rolle?.id ?? randomUUID(), benutzer: benutzer?.id ?? randomUUID() };
    if (!rolle) {
      rolle = await this.repo.legeTypAn(ids.rolle, {
        name: frei(SYSTEMTYPEN.rolle), schluessel: sk('rolle'), beschreibung: t('meldungen.dienst.rollen-die-benutzer-haben'), titelVorlage: '{name}',
        felder: systemfelder('rolle', ids.rolle),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: ['name'] },
          { key: 'benutzer', name: REGISTERNAMEN.benutzer, art: 'verknuepfungen', quellen: [{ typId: ids.benutzer, feldKey: 'rollen' }] },
        ],
        trefferliste: [], erstellenErlaubt: true, loeschenErlaubt: true,
      }, 'rolle');
      neu.push(rolle);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: rolle.name });
    }
    if (!benutzer) {
      benutzer = await this.repo.legeTypAn(ids.benutzer, {
        name: frei(SYSTEMTYPEN.benutzer), schluessel: sk('benutzer'), beschreibung: t('meldungen.dienst.die-benutzer-dieser-installation'), titelVorlage: '{name}',
        felder: systemfelder('benutzer', rolle.id, ids.benutzer),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: ['name', 'email', 'rollen', 'aktiv', 'abwesend', 'abwesend_von', 'abwesend_bis', 'vertreter'] },
          { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
          { key: 'verknuepfungen', name: REGISTERNAMEN.verknuepfungen, art: 'verknuepfungen', quellen: [] },
        ],
        trefferliste: ['name', 'email', 'rollen', 'aktiv'], erstellenErlaubt: false, loeschenErlaubt: false,
      }, 'benutzer');
      neu.push(benutzer);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: benutzer.name });
    }
    if (!post) {
      // Post (#192): alles, was hinein- oder hinausgeht; ersetzt den früheren Typ E-Mail (#58).
      post = await this.repo.legeTypAn(randomUUID(), {
        name: frei(SYSTEMTYPEN.post), schluessel: sk('post'), beschreibung: POST_BESCHREIBUNG, titelVorlage: '{betreff}',
        felder: systemfelder('post', rolle.id, benutzer.id),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: systemfelder('post', rolle.id, benutzer.id).map((f) => f.key) },
          { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
          { key: 'protokoll', name: REGISTERNAMEN.historie, art: 'protokoll' },
        ],
        trefferliste: POST_SPALTEN, erstellenErlaubt: false, loeschenErlaubt: true,
      }, 'post');
      neu.push(post);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: post.name });
    }
    post = await this.wandleZuPost(post, rolle.id, benutzer.id);
    benutzer = await this.ergaenzeSystemfelder(benutzer, rolle.id);
    for (const r of Object.keys(ROLLEN) as Array<keyof typeof ROLLEN>) {
      const kennung = systemrolleKennung(r);
      if (await this.repo.holeSystemMappe(kennung)) continue;
      const name = (await this.repo.findeDoppelt(rolle.id, 'name', ROLLEN[r])) ? `${ROLLEN[r]} (System)` : ROLLEN[r];
      await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
    }
    // Systemrollen für Konten, die kein Mensch sind (#673): Systemkonto und Paket – nur in Regeln am Mappentyp, nie an Menschen vergeben.
    for (const r of Object.keys(KONTOROLLEN) as Kontorolle[]) {
      const kennung = kontorolleKennung(r);
      if (await this.repo.holeSystemMappe(kennung)) continue;
      const name = (await this.repo.findeDoppelt(rolle.id, 'name', KONTOROLLEN[r])) ? `${KONTOROLLEN[r]} (System)` : KONTOROLLEN[r];
      await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
    }
    await this.loeseFruehereAdminrolle(benutzer);
    rolle = await this.beschrifteSystemtyp(rolle, rolle.id, benutzer.id);
    benutzer = await this.beschrifteSystemtyp(benutzer, rolle.id, benutzer.id);
    post = await this.beschrifteSystemtyp(post, rolle.id, benutzer.id);
    return { post, neu };
  }

  /**
   * Beschriftungen der Systemmappentypen (#729): Name, Beschreibung, Register und Systemfelder auf Englisch (und in
   * installierten Sprachen) – bei jedem Start ergänzt, nie überschrieben. Eigene Namen des Administrators bleiben ohne
   * fremde Beschriftung, damit dort nicht plötzlich der Standardname erscheint.
   */
  private async beschrifteSystemtyp(typ: Mappentyp, rolleId: string, benutzerId: string): Promise<Mappentyp> {
    const system = typ.system;
    if (!system) return typ;
    const soll = systemfelder(system, rolleId, benutzerId);
    const felder = typ.felder.map((f) => { const x = f.system ? soll.find((y) => y.key === f.key) : undefined; return x ? { ...f, ...mitSystemBeschriftung(f, x) } : f; });
    const BESCHREIBUNG: Record<string, string> = { rolle: 'meldungen.dienst.rollen-die-benutzer-haben', benutzer: 'meldungen.dienst.die-benutzer-dieser-installation', post: 'meldungen.dienst.alles-was-in-ablago' };
    const tb = systemBeschriftung<TypTeile>({
      ...(typ.name === SYSTEMTYPEN[system] ? { name: `gemeinsam.model.systemtyp.${system}` } : {}),
      ...(typ.beschreibung === inSprache('de', () => t.frei(BESCHREIBUNG[system])) ? { beschreibung: BESCHREIBUNG[system] } : {}),
    });
    const REG: Record<string, keyof typeof REGISTERNAMEN> = { allgemein: 'allgemein', dokumente: 'dokumente', verknuepfungen: 'verknuepfungen', benutzer: 'benutzer', protokoll: 'historie' };
    const register = typ.register.map((r) => {
      const k = REG[r.key];
      const b = k && r.name === REGISTERNAMEN[k] ? systemBeschriftung<NamensTeile>({ name: `gemeinsam.model.register.${k}` }) : undefined;
      return b ? { ...r, ...mitBeschriftungen(ergaenzeBeschriftungen(r.beschriftungen, b)) } : r;
    });
    const beschriftungen = ergaenzeBeschriftungen(typ.beschriftungen, tb);
    const neu = { ...typ, felder, register, ...mitBeschriftungen(beschriftungen) };
    if (JSON.stringify(neu) === JSON.stringify(typ)) return typ;
    return this.repo.aendereTyp(typ.id, { ...neu, trefferlisten: trefferlistenVon(neu), trefferliste: undefined });
  }

  /**
   * Umstellung #818: Die Systemrolle „Administrator“ entfällt. Ihre Mappe verliert die Kennung und wird eine
   * gewöhnliche Rolle ohne Mitglieder – so bleiben Regeln gültig, die sie nennen; ohne solche Regeln kann man sie
   * löschen. Einmalig beim ersten Start nach dem Update.
   */
  private async loeseFruehereAdminrolle(benutzerTyp: Mappentyp) {
    const alt = await this.repo.holeSystemMappe(FRUEHERE_ADMINROLLE);
    if (!alt) return;
    for (const m of await this.repo.listeMappen(benutzerTyp.id)) {
      const rollen = alsListe(m.werte.rollen);
      if (rollen.includes(alt.id)) await this.schreibeSystemMappe(benutzerTyp, m.id, { ...m.werte, rollen: rollen.filter((r) => r !== alt.id) }, null);
    }
    await this.repo.setzeSystemKennung(alt.id, null);
    protokoll.modul('werkbank').warn('Systemrolle „Administrator“ aufgelöst: jetzt eine gewöhnliche Rolle ohne Mitglieder', { rolle: alt.titel || String(alt.werte.name ?? '') });
  }

  /**
   * Spur im Verwaltungsmodus (#820): Für jede Mappe, die die Person mit ihren Alltagsrechten (`alltag`, ohne Modus)
   * nicht lesen dürfte, steht in der Historie „im Verwaltungsmodus“ mit `was` – nicht löschbar. Dieselbe Mappe kurz
   * hintereinander (`MODUSSPUR_MINUTEN`) nur einmal je Person und Art. Liefert die betroffenen Mappen.
   */
  async vermerkeVerwaltungsmodus(alltag: { id: string; rolle: string; name?: string; email?: string }, ids: string[], was: Modusspur): Promise<Set<string>> {
    const z = await this.zugriff({ id: alltag.id, rolle: 'mitglied' });
    const lesbar = await this.lesbare(z, ids);
    const fremd = [...new Set(ids)].filter((id) => !lesbar.has(id));
    if (!fremd.length) return new Set();
    // „Kurz hintereinander nur einmal“ (#744): Merker in der Datenbank – wer ihn anlegt, schreibt den Eintrag, auch wenn
    // dieselbe Person gleichzeitig über zwei Prozesse kommt.
    const belegt = await this.kurzzustand.belegeAlle(MODUSSPUR, fremd.map((id) => `${alltag.id}|${id}|${was}`), MODUSSPUR_MINUTEN * 60_000);
    const neu = fremd.filter((id) => belegt.has(`${alltag.id}|${id}|${was}`));
    if (neu.length) {
      const titel = new Map((await this.repo.holeMappen(neu)).map((m) => [m.id, m.titel ?? '']));
      await this.repo.historieSchreibe(neu.map((id) => ({ mappeId: id, benutzerId: alltag.id, art: 'verwaltungsmodus' as const, daten: { was, titel: titel.get(id) ?? '' } })));
      protokoll.modul('ablage').warn('Im Verwaltungsmodus: fremde Mappe', { was, anzahl: neu.length, von: alltag.email ?? alltag.id, imVerwaltungsmodus: true });
    }
    return new Set(fremd);
  }

  /** Werkbank (#820): „Im Verwaltungsmodus angesehen“ – Person, Mappe, Zeit; neueste zuerst. */
  async imVerwaltungsmodus(max = 500) {
    const liste = await this.repo.historieArt('verwaltungsmodus', max);
    // Typ für den Link in die Ablage; endgültig gelöschte Mappen bleiben in der Liste, nur ohne Link.
    const typ = new Map((await this.repo.holeMappen([...new Set(liste.map((h) => h.mappeId))])).map((m) => [m.id, m.typId]));
    return liste.map((h) => ({
      id: h.id, zeit: h.zeit, mappeId: h.mappeId, typId: typ.get(h.mappeId) ?? null, benutzerId: h.benutzerId, was: String(h.daten.was ?? 'angesehen'), titel: String(h.daten.titel ?? ''),
    }));
  }

  /**
   * Aus dem früheren Typ E-Mail (#58) wird Post (#192). Die Migration 031 hat Kennung, Schlüssel und
   * Werte umgestellt; hier folgt die Definition: Systemfelder mit ihrer festen Form (z. B. „Zugeordnet zu“
   * mehrfach), neue Felder, Name und Register, solange der Administrator sie nicht geändert hat.
   * Läuft bei jedem Start und ändert nur, was noch nicht passt.
   */
  private async wandleZuPost(mappentyp: Mappentyp, rolleId: string, benutzerId: string): Promise<Mappentyp> {
    const soll = systemfelder('post', rolleId, benutzerId);
    // Alte Standardbezeichnungen weichen den neuen; eigene des Administrators bleiben. „von“ und „an“ (#1042, Migration
    // 099): bis 0.240 „Absender“ (absender), „Für“ (fuer) und „Empfänger“ (an, jetzt an_adresse) – dann auch die
    // Beschriftungen in weiteren Sprachen neu (sonst bliebe englisch „Sender“).
    const alteNamen: Record<string, string[]> = {
      bezug: ['Bezug'], von: ['Absender', 'Sender'], an: ['Für', 'For'], an_adresse: ['An', 'Empfänger', 'Recipient'],
    };
    const alteHilfen = [t('meldungen.dienst.wer-die-e-mail'), t('meldungen.dienst.die-mappe-aus-der'), t('meldungen.dienst.post-hilfe-fuer-bis-0-237')];
    let geaendert = false;
    const felder = mappentyp.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      if (!s || !f.system) return f;
      const altName = !!alteNamen[f.key]?.includes(f.label);
      const label = altName ? s.label : f.label || s.label;
      const hilfe = !f.hilfe || alteHilfen.includes(f.hilfe) ? s.hilfe : f.hilfe;
      const bisher = altName && ['von', 'an', 'an_adresse'].includes(f.key) ? { ...f, beschriftungen: undefined } : f;
      const neu: Feld = { ...s, label, ...(hilfe ? { hilfe } : {}), ...mitSystemBeschriftung({ ...bisher, label, hilfe }, s) };
      if (!hilfe) delete neu.hilfe;
      if (JSON.stringify(neu) !== JSON.stringify(f)) geaendert = true;
      return neu;
    });
    const altName = mappentyp.name === 'E-Mail' || mappentyp.name === 'E-Mail (System)';
    const register = mappentyp.register.map((r) => (r.art === 'dokumente' && r.name === 'Anhänge' ? { ...r, name: 'Dokumente' } : r));
    const altListe = JSON.stringify(standardliste(mappentyp).spalten) === JSON.stringify(['datum', 'an', 'bezug']);
    if (geaendert || altName || JSON.stringify(register) !== JSON.stringify(mappentyp.register) || altListe || mappentyp.beschreibung === 'Aus Ablago verschickte E-Mails mit Anhängen') {
      const typen = await this.repo.listeTypen();
      const name = altName ? (typen.some((x) => x.id !== mappentyp.id && x.name.trim().toLowerCase() === 'post') ? t('meldungen.dienst.post-system') : 'Post') : mappentyp.name;
      const beschreibung = mappentyp.beschreibung === 'Aus Ablago verschickte E-Mails mit Anhängen' ? POST_BESCHREIBUNG : mappentyp.beschreibung;
      const trefferlisten = altListe ? trefferlistenVon(mappentyp).map((l) => (l.standard ? { ...l, spalten: POST_SPALTEN } : l)) : trefferlistenVon(mappentyp);
      mappentyp = await this.repo.aendereTyp(mappentyp.id, { ...mappentyp, name, beschreibung, felder, register, trefferlisten, trefferliste: undefined });
      protokoll.modul('werkbank').info('Systemmappentyp Post nachgezogen', { typ: mappentyp.name });
    }
    // Neue Systemfelder (Stand, Kanal, Richtung, An) ergänzen – wie bei jedem Systemtyp.
    return this.ergaenzeSystemfelder(mappentyp, rolleId, benutzerId);
  }

  /**
   * Neue Systemfelder einer Version (z. B. Abwesenheit, #78) in einen vorhandenen Systemtyp aufnehmen.
   * Hat der Administrator schon ein eigenes Feld mit diesem Schlüssel, wird seines umbenannt
   * (z. B. vertreter → vertreter_alt) – samt Werten, Register, Trefferlisten und Titel-Vorlage.
   */
  private async ergaenzeSystemfelder(t: Mappentyp, rolleId: string, benutzerId = t.id): Promise<Mappentyp> {
    if (!t.system) return t;
    const soll = systemfelder(t.system, rolleId, benutzerId);
    const fehlen = soll.filter((x) => !t.felder.some((f) => f.key === x.key && f.system));
    if (!fehlen.length) return t;
    const felder = [...t.felder];
    const register = structuredClone(t.register);
    let trefferlisten = trefferlistenVon(t);
    let titelVorlage = t.titelVorlage;
    const umbenannt: Array<[string, string]> = [];
    for (const x of fehlen) {
      const i = felder.findIndex((f) => f.key === x.key);
      if (i >= 0) {
        let neu = `${x.key}_alt`;
        for (let n = 2; felder.some((f) => f.key === neu); n++) neu = `${x.key}_alt${n}`;
        felder[i] = { ...felder[i], key: neu };
        for (const r of register) if (r.felder) r.felder = r.felder.map((k) => (k === x.key ? neu : k));
        trefferlisten = trefferlisten.map((l) => ({ ...l, spalten: l.spalten.map((k) => (k === x.key ? neu : k)) }));
        titelVorlage = titelVorlage.replace(new RegExp(`\\{${x.key}(?=[|}])`, 'g'), `{${neu}`);
        // Zusammengesetzt (#1050): Vorlagen, die das Feld nennen, ebenso.
        for (const [j, g] of felder.entries()) if (g.vorlage) felder[j] = { ...g, vorlage: g.vorlage.replace(new RegExp(`\\{${x.key}(?=[|}])`, 'g'), `{${neu}`) };
        umbenannt.push([x.key, neu]);
      }
      felder.push(x);
      const allgemein = register.find((r) => r.art === 'felder');
      if (allgemein) allgemein.felder = [...(allgemein.felder ?? []), x.key];
    }
    const neuTyp = await this.repo.aendereTyp(t.id, { ...t, felder, register, trefferlisten, trefferliste: undefined, titelVorlage });
    if (umbenannt.length) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const werte = { ...m.werte };
        for (const [alt, neu] of umbenannt) if (alt in werte) { werte[neu] = werte[alt]; delete werte[alt]; }
        await this.repo.aendereMappe(m.id, werte, [], null, { basis: m.werte, verweise: (w) => verweiseVon(neuTyp, w) });
      }
      protokoll.modul('werkbank').warn('Eigene Felder wegen neuer Systemfelder umbenannt', { typ: t.name, felder: umbenannt.map(([a, b]) => `${a} → ${b}`).join(', ') });
    }
    protokoll.modul('werkbank').info('Systemfelder ergänzt', { typ: t.name, felder: fehlen.map((f) => f.label).join(', ') });
    return neuTyp;
  }

  /** Weitere (nicht System-)Rollen je Benutzer. */
  async weitereRollen(): Promise<Map<string, string[]>> {
    const { benutzer, systemrollen } = await this.kern.system();
    const system = new Set(systemrollen.values());
    return new Map((await this.repo.listeMappen(benutzer.id)).map((m) => [m.id, alsListe(m.werte.rollen).filter((r) => !system.has(r))]));
  }

  /** Benutzer werden deaktiviert statt gelöscht; gelöscht wird nur, worauf nichts verweist. */
  async entferneBenutzerMappe(id: string) {
    const m = await this.repo.holeMappe(id);
    if (!m) return;
    const fremd: Rueckverweis[] = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, t('meldungen.dienst.auf-diesen-benutzer-verweisen', { anzahl: fremd.length }), { rueckverweise: fremd });
    }
    await this.loescheMappeIntern(id, await this.repo.holeTyp(m.typId));
  }

  benutzerspiegel(): Benutzerspiegel {
    return {
      aktualisiere: (b, von, abwesenheit) => this.spiegleBenutzer(b, von ?? null, abwesenheit),
      offeneAufgaben: async (id) => (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id).length,
      aufgabenUebergeben: (id, an, von) => this.aufgabenUebergeben(id, an, von),
      entferne: (id) => this.entferneBenutzerMappe(id),
      papierkorbAn: async () => (await this.kern.papierkorbTage()) > 0,
      inPapierkorb: async (id, von) => {
        const m = await this.repo.holeMappe(id);
        if (!m) return;
        const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
        if (fremd.length) throw new Fachfehler(409, t('meldungen.dienst.auf-diesen-benutzer-verweisen', { anzahl: fremd.length }), { rueckverweise: fremd });
        await this.repo.legeInPapierkorb(id, von);
        await this.notiere(id, von, 'papierkorb');
      },
    };
  }
}
