/**
 * Mappentypen (#1073, aus dienst.ts): anlegen, ändern, löschen und prüfen; Mappentypen für einen Benutzer, Rechte je
 * Typ fürs Profil, Erkennung am Typ. Schicht 2 – bekommt den Kern, nicht den ganzen Dienst.
 */
import { randomUUID } from 'node:crypto';
import { istOk, kannAusPost, pruefeMappentyp, freierSchluessel, systemfelder, zielErlaubt, zieleVon, BELIEBIGER_TYP, einzigesZiel, jedeMappe, type Mappentyp, type MappentypDaten, type Systemtyp } from '../../../shared/src/model';
import { festigeDarstellung } from '../../../shared/src/darstellung';
import { abschnittName, anzeigeProblemeVon } from '../../../shared/src/anzeige';
import { auswahlProbleme, kinderVon } from '../../../shared/src/sichten';
import { empfaengerFelder } from '../../../shared/src/fristen';
import { istOffen, rechteUebersicht, systemSperre, type Recht, type Regelwerk } from '../../../shared/src/rechte';
import { liesAusDokument, type AusDokument } from '../../../shared/src/erkennung';
import type { StempelTyp } from '../../../shared/src/stempel';
import { teileKennung } from '../../../shared/src/kennungen';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { protokoll } from '../protokoll';
import { istUuid, KonfigurationVeraltet, type Repo } from '../repo';
import { t } from '../sprache';
import { behalteBeschriftungen, behalteDarstellung, behalteErkennung, bereinigeTyp, liesStand, mitSystemBeschriftung } from './eingabe';

/** Was die Mappentypen außer dem Kern brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface MappentypenAnschluss {
  /** Mappentypen mit ihrer Stempel-Einstellung und Erkennung (#394, #391; Stempel noch im Dienst). */
  mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]>;
  /** Stempel-Einstellung eines Mappentyps prüfen bzw. setzen (#394). */
  pruefeStempelTyp(v: unknown): Promise<StempelTyp | null>;
  setzeStempelTyp(typId: string, st: StempelTyp | null): Promise<void>;
  /** Erkennung per Paket (#511): Wahl am Typ prüfen. */
  erkennung(): { pruefeTypWahl(ad: AusDokument | null): Promise<unknown> };
  /** Berechtigungen aus der Eingabe (#142) prüfen bzw. ins Protokoll schreiben (Berechtigungen, noch im Dienst). */
  berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown): Promise<{ rw: Regelwerk; niemand: number } | null>;
  protokolliereBerechtigungen(typ: Mappentyp, niemand: number): void;
  /** 409 „Jemand hat den Mappentyp inzwischen geändert“ (#917). */
  konfigurationKonflikt(art: 'typ', aktuell?: string): Fachfehler;
}

/**
 * Schnittstelle (#1036): Verweisfelder mit genau einem Zieltyp (oder „jede Mappe“) nennen ihn zusätzlich wie bisher in
 * `zielTyp` – Clients, die `zielTypen` noch nicht kennen, arbeiten so weiter. Veraltet; bei mehreren Zieltypen fehlt es.
 */
function mitAltemZiel<T extends Pick<Mappentyp, 'felder'>>(t: T): T {
  if (!t.felder.some((f) => f.typ === 'referenz')) return t;
  return { ...t, felder: t.felder.map((f) => { const alt = jedeMappe(f) ? BELIEBIGER_TYP : einzigesZiel(f); return f.typ === 'referenz' && alt ? { ...f, zielTyp: alt } : f; }) };
}

export class MappentypenDienst {
  constructor(private readonly kern: Kern, private readonly anschluss: MappentypenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get erkennung() { return this.anschluss.erkennung(); }
  private inEinemZug<T>(f: () => Promise<T>): Promise<T> { return this.kern.inEinemZug(f); }
  private mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]> { return this.anschluss.mitStempel(typen); }
  private pruefeStempelTyp(v: unknown) { return this.anschluss.pruefeStempelTyp(v); }
  private setzeStempelTyp(typId: string, st: StempelTyp | null) { return this.anschluss.setzeStempelTyp(typId, st); }
  private berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown) { return this.anschluss.berechtigungenAusEingabe(typ, eingabe); }

  listeTypen() { return this.repo.listeTypen(); }

  /** Mappentypen für einen Benutzer: Administratoren mit Regeln, alle anderen ohne – dafür „darf anlegen“ (#126). */
  async typenFuer(z: Zugriff) {
    const typen = (await this.mitStempel([...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')))).map(mitAltemZiel);
    if (z.admin) return typen;
    return typen.map(({ berechtigungen, ...t }) => ({ ...t, berechtigungen: null, darfAnlegen: rechteUebersicht({ ...t, berechtigungen }, z.wer, z.a).C !== 'nie' }));
  }

  /** Profil (#126): je Mappentyp, welche Rechte man hat – „immer“, „nie“ oder „je nach Mappe“. */
  async rechteUebersicht(z: Zugriff) {
    return [...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((t) => ({
      typId: t.id, name: t.name,
      rechte: z.admin ? Object.fromEntries((['C', 'R', 'U', 'D', 'P'] as Recht[]).map((k) => [k, (k === 'C' && systemSperre(t).C) || (k === 'D' && systemSperre(t).D) ? 'nie' : 'immer'])) : rechteUebersicht(t, z.wer, z.a),
    }));
  }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    if (d.archiv?.stichtag && d.felder.find((f) => f.key === d.archiv!.stichtag)?.typ !== 'datum') {
      throw new Fachfehler(422, t('meldungen.dienst.archivmodus-der-stichtag-muss'), { allgemein: [t('meldungen.dienst.archivmodus-der-stichtag-muss')], felder: {} });
    }
    const alle = await this.repo.listeTypen();
    // Quellen von Verknüpfungsregistern, deren Feld es nicht mehr gibt, still entfernen.
    for (const r of d.register) {
      if (r.art !== 'verknuepfungen') continue;
      r.quellen = (r.quellen ?? []).filter((q) => {
        const felder = q.typId === eigeneId ? d.felder : alle.find((t) => t.id === q.typId)?.felder;
        const f = felder?.find((x) => x.key === q.feldKey);
        return f?.typ === 'referenz' && zielErlaubt(f, eigeneId);
      });
    }
    // Fristen (#129): Empfängerfeld nur, wenn es ein einfaches Benutzerfeld dieses Typs ist.
    const benutzerTyp = alle.find((t) => t.system === 'benutzer')?.id;
    const taugt = new Set(empfaengerFelder(d, benutzerTyp).map((f) => f.key));
    for (const f of d.felder) if (f.frist?.empfaengerFeld && !taugt.has(f.frist.empfaengerFeld)) f.frist.empfaengerFeld = null;
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      schluesselAndererTypen: alle.filter((t) => t.id !== eigeneId && t.schluessel).map((t) => t.schluessel!),
      existiertTyp: (id) => alle.some((t) => t.id === id),
      felderVon: (id) => alle.find((t) => t.id === id)?.felder,
      nummernkreise: (await this.repo.listeNummernkreise()).map((k) => k.schluessel),
      auswahlProbleme: (bed, felder, eigene) => auswahlProbleme(bed, { felder }, eigene),
    });
    // Anzeigen, wenn … (#1033): Bedingungen auf Felder dieses Typs; ein Abschnitt nie auf eigene Felder.
    for (const [wo, liste] of Object.entries(anzeigeProblemeVon(d, (x) => x === eigeneId || alle.some((y) => y.id === x)))) {
      if (wo.startsWith('feld:')) {
        const i = d.felder.findIndex((f) => `feld:${f.key}` === wo);
        (p.felder[String(i)] ??= []).push(...liste);
      } else {
        const [rk, vor] = wo.slice('abschnitt:'.length).split('.');
        const r = d.register.find((x) => x.key === rk);
        const a = r?.abschnitte?.find((x) => x.vor === vor);
        const name = a ? abschnittName(a, d) : vor;
        p.allgemein.push(...liste.map((x) => t('meldungen.dienst.anzeige-abschnitt', { name, problem: x })));
      }
    }
    if (!istOk(p)) throw new Fachfehler(422, t('meldungen.dienst.der-mappentyp-ist-so'), p);
  }

  /** Mappentyp anlegen bzw. ändern; die Stempel-Einstellung (#394) liegt daneben in den Einstellungen. */
  /** ausPaket (#1084): Id des Pakets, das den Typ anlegt – nur dann darf die Kennung `paket:schluessel` lauten. */
  async legeTypAn(eingabe: unknown, ausPaket?: string): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.legeTypAnIntern(e, ausPaket)); }
  async aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.aendereTypIntern(id, e)); }
  private async mitStempelEingabe(eingabe: unknown, f: (e: unknown) => Promise<Mappentyp>): Promise<Mappentyp> {
    const hat = !!eingabe && typeof eingabe === 'object' && 'stempel' in eingabe;
    const st = hat ? await this.pruefeStempelTyp((eingabe as { stempel: unknown }).stempel) : undefined;
    // „Aus Dokument ausfüllen“ (#391): Beschriftung bzw. ausgeblendet – liegt wie der Stempel in den Einstellungen.
    const hatAd = !!eingabe && typeof eingabe === 'object' && 'ausDokument' in eingabe;
    // Erkennung per Paket (#511): vor dem Speichern prüfen (Paket da, Datenabfluss bestätigt).
    if (hatAd) await this.erkennung.pruefeTypWahl(liesAusDokument((eingabe as { ausDokument: unknown }).ausDokument));
    const t = await f(eingabe);
    if (hat) await this.setzeStempelTyp(t.id, st ?? null);
    if (hatAd) await this.setzeTypErkennung(t.id, { ausDokument: liesAusDokument((eingabe as { ausDokument: unknown }).ausDokument) });
    // Post automatisch zuordnen (#337), Standard aus.
    if (!!eingabe && typeof eingabe === 'object' && 'autoZuordnen' in eingabe) await this.setzeTypErkennung(t.id, { auto: (eingabe as { autoZuordnen: unknown }).autoZuordnen === true && !t.system });
    return (await this.mitStempel([t]))[0];
  }

  /** „Aus Dokument ausfüllen“ eines Mappentyps (#391, #511): Beschriftung, ausgeblendet, Erkennung. */
  async ausDokumentVon(typId: string): Promise<AusDokument | null> { return (await this.typErkennungen())[typId]?.ausDokument ?? null; }

  /** Einstellungen der Erkennung je Mappentyp (#391, #337): Einstellung erkennung_typen, Typ-Id → Angaben. */
  async typErkennungen(): Promise<Record<string, { ausDokument?: AusDokument | null; auto?: boolean }>> {
    const v = await this.einstellungen?.lies('erkennung_typen');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, { ausDokument?: AusDokument | null; auto?: boolean }> : {};
  }
  private async setzeTypErkennung(typId: string, teil: { ausDokument?: AusDokument | null; auto?: boolean }) {
    if (!this.einstellungen) return;
    const alle = await this.typErkennungen();
    const neu = { ...(alle[typId] ?? {}), ...teil };
    if (!neu.ausDokument) delete neu.ausDokument;
    if (!neu.auto) delete neu.auto;
    if (JSON.stringify(neu) === JSON.stringify(alle[typId] ?? {})) return;
    if (Object.keys(neu).length) alle[typId] = neu; else delete alle[typId];
    await this.einstellungen.schreibe('erkennung_typen', Object.keys(alle).length ? alle : null);
    protokoll.modul('werkbank').info('Erkennung am Mappentyp eingestellt', { typ: typId, ...teil });
  }

  /** Kennungen mit Paket (`paket:schluessel`, #1084) vergibt nur die Paketverwaltung – sonst könnte ein eigener Typ einem Paket die Kennung wegnehmen. */
  private static pruefePaketKennung(schluessel: string | undefined, ausPaket?: string) {
    if (!schluessel?.includes(':') || teileKennung(schluessel).paket === ausPaket) return;
    throw new Fachfehler(422, t('meldungen.dienst.kennung-mit-paket', { schluessel }), { allgemein: [t('meldungen.dienst.kennung-mit-paket', { schluessel })], felder: {} });
  }

  private async legeTypAnIntern(eingabe: unknown, ausPaket?: string): Promise<Mappentyp> {
    const roh = (eingabe ?? {}) as { id?: unknown };
    // Die Oberfläche darf die Id vorgeben, damit ein neuer Typ auf sich selbst verweisen kann.
    const id = istUuid(roh.id) && !(await this.repo.holeTyp(roh.id)) ? roh.id : randomUUID();
    const d = bereinigeTyp(eingabe);
    MappentypenDienst.pruefePaketKennung(d.schluessel, ausPaket);
    // Schlüssel (#145): ohne Angabe aus dem Namen, eindeutig.
    if (!d.schluessel) d.schluessel = freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    const rechte = await this.berechtigungenAusEingabe({ ...d, id, erstellt: '', geaendert: '', berechtigungen: null }, eingabe);
    // In einer Transaktion (#962): Typ, Berechtigungen und die sofortigen Empfänger (eigene Sicht) ganz oder gar nicht.
    return this.inEinemZug(async () => {
      let typ = await this.repo.legeTypAn(id, d);
      if (rechte) typ = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw);
      await this.kern.anlaesse.typAngelegt.melde({ typ, sicht: (roh as { sichtAnlegen?: unknown }).sichtAnlegen !== false });
      if (rechte) this.kern.danach(() => this.anschluss.protokolliereBerechtigungen(typ, 0));
      return typ;
    });
  }

  /**
   * Gleichzeitig bearbeiten (#917): Mit `stand` (`geaendert` des Typs, wie gelesen) speichert Ablago nur, wenn seitdem
   * niemand den Typ geändert hat – sonst 409, nichts wird überschrieben. Ohne `stand` keine Prüfung (wie bisher).
   */
  private async aendereTypIntern(id: string, eingabe: unknown): Promise<Mappentyp> {
    const alt = await this.repo.holeTyp(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    const stand = liesStand((eingabe as { stand?: unknown } | null)?.stand, 'meldungen.dienst.stand-ungueltig');
    if (stand !== undefined && alt.geaendert !== stand) throw this.anschluss.konfigurationKonflikt('typ', alt.geaendert);
    let d = behalteDarstellung(eingabe, behalteErkennung(eingabe, behalteBeschriftungen(eingabe, bereinigeTyp(eingabe), alt), alt), alt);
    if (alt.system) d = await this.mitSystemfeldern(d, alt.system);
    // Ausblenden (#655): erst jetzt sind die Systemfelder bekannt – sie und ihre Register bleiben sichtbar.
    festigeDarstellung(d);
    // Der Schlüssel ist fest (#145); fehlt er noch, gilt der eingegebene bzw. einer aus dem Namen.
    if (!alt.schluessel) MappentypenDienst.pruefePaketKennung(d.schluessel);
    d.schluessel = alt.schluessel ?? d.schluessel ?? freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).filter((t) => t.id !== id).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    // Berechtigungen (#142) gegen die neuen Felder prüfen, bevor etwas gespeichert ist.
    const rechte = await this.berechtigungenAusEingabe({ ...alt, ...d }, eingabe);
    const bleiben = new Set(d.register.filter((r) => r.art === 'dokumente').map((r) => r.key));
    for (const [key, n] of await this.repo.dokumenteJeRegister(id)) {
      if (bleiben.has(key)) continue;
      const name = alt.register.find((r) => r.key === key)?.name ?? key;
      throw new Fachfehler(409, t('meldungen.dienst.im-register-liegen-noch', { anzahl: n, name }));
    }
    // In einer Transaktion (#962): Typ, Ansicht, Titel, Passung, Fristen und Berechtigungen ganz oder gar nicht. Vorher
    // lief jeder Schritt für sich – ein Fehler mittendrin ließ einen halb nachgezogenen Typ zurück.
    return this.inEinemZug(async () => {
      let typ: Mappentyp;
      try { typ = await this.repo.aendereTyp(id, d, stand); }
      catch (f) { if (f instanceof KonfigurationVeraltet) throw this.anschluss.konfigurationKonflikt('typ'); throw f; }
      await this.kern.anlaesse.typGeaendert.melde({ alt, typ });
      if (!rechte) return typ;
      const mit = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw);
      this.kern.danach(() => this.anschluss.protokolliereBerechtigungen(mit, rechte.niemand));
      return mit;
    });
  }

  /**
   * Systemtypen: Systemfelder müssen bleiben und behalten ihre feste Definition;
   * Bezeichnung und Hilfetext darf der Administrator ändern. Benutzer-Mappen entstehen
   * und verschwinden nur über die Benutzerverwaltung.
   */
  private async mitSystemfeldern(d: MappentypDaten, system: Systemtyp): Promise<MappentypDaten> {
    const typen = await this.repo.listeTypen();
    const soll = systemfelder(system, typen.find((t) => t.system === 'rolle')?.id ?? '', typen.find((t) => t.system === 'benutzer')?.id ?? '');
    const fehlen = soll.filter((s) => !d.felder.some((f) => f.key === s.key));
    if (fehlen.length) throw new Fachfehler(422, t('meldungen.dienst.systemfelder-lassen-sich-nicht', { map: fehlen.map((f) => f.label).join(', ') }));
    const felder = d.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      // Beschriftungen je Sprache (#728) darf der Administrator wie Bezeichnung und Hilfetext setzen.
      return s ? { ...s, label: f.label || s.label, hilfe: f.hilfe || s.hilfe, ...mitSystemBeschriftung(f, s) } : f;
    });
    // Systemtypen (#937): nie aus Post anzulegen, kein „Woran man ihn erkennt“.
    const ohneErkennbar = d.beschriftungen ? Object.fromEntries(Object.entries(d.beschriftungen).map(([k, v]) => { const { erkennbarAn: _e, ...rest } = v ?? {}; return [k, rest]; })) : undefined;
    return { ...d, felder, ausPost: false, erkennbarAn: '', beschriftungen: ohneErkennbar, ...(system === 'benutzer' ? { erstellenErlaubt: false, loeschenErlaubt: false } : system === 'post' ? { erstellenErlaubt: false } : {}) };
  }

  async loescheTyp(id: string): Promise<void> {
    const eintrag = await this.repo.holeTyp(id);
    if (!eintrag) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (eintrag.system) throw new Fachfehler(409, t('meldungen.dienst.ist-ein-systemmappentyp-er', { name: eintrag.name }));
    const gruende: string[] = [];
    const n = await this.repo.zaehleMappen(id);
    if (n) gruende.push(t('meldungen.dienst.mappen-gehoeren-zu-diesem', { anzahl: n }));
    const imKorb = (await this.repo.papierkorb({ typId: id })).length;
    if (imKorb) gruende.push(t('meldungen.dienst.mappen-dieses-typs-liegen', { anzahl: imKorb }));
    // Mehrere Zieltypen (#1036): Ist der Typ nur einer von mehreren Zielen – oder ein optionales Ziel aus einem Paket –,
    // nimmt das Löschen ihn dort heraus (Mappen dieses Typs gibt es dann keine mehr, also auch keine Verweise darauf).
    // Ein Feld, das allein auf ihn zeigt, hält das Löschen auf wie bisher.
    const herausnehmen: Mappentyp[] = [];
    for (const mappentyp of await this.repo.listeTypen()) {
      if (mappentyp.id === id) continue;
      let anders = false;
      for (const f of mappentyp.felder) {
        if (f.typ !== 'referenz' || !zieleVon(f).includes(id)) continue;
        if (zieleVon(f).length > 1 || (eintrag.schluessel && f.zielOptional?.includes(eintrag.schluessel))) anders = true;
        else gruende.push(t('meldungen.dienst.das-feld-verweist-auf', { name: mappentyp.name, label: f.label }));
      }
      if (anders) herausnehmen.push(mappentyp);
    }
    if (gruende.length) throw new Fachfehler(409, t('meldungen.dienst.dieser-mappentyp-kann-noch'), { gruende });
    for (const mt of herausnehmen) {
      const felder = mt.felder.map((f) => (f.typ === 'referenz' && zieleVon(f).includes(id) ? { ...f, zielTypen: zieleVon(f).filter((z) => z !== id) } : f));
      await this.repo.aendereTyp(mt.id, { ...mt, felder });
    }
    await this.repo.loescheTyp(id);
    // Aus den Sichten entfernen; Sichten, die nur diesen Typ hatten und keine Kinder, verschwinden mit.
    const alle = await this.repo.listeSichten();
    for (const x of alle.filter((v) => v.typen.includes(id))) {
      const typen = x.typen.filter((t) => t !== id);
      if (!typen.length && !kinderVon(alle, x.id).length) await this.repo.loescheSicht(x.id);
      else await this.repo.aendereSicht(x.id, { ...x, typen });
    }
  }

  /** Warum Mappentypen nicht weg dürfen: Mappen oder Papierkorb-Einträge. Leer = frei. */
  async belegteTypen(ids: string[], ohne: string[] = []): Promise<string[]> {
    const gruende: string[] = [];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    // Mappen, die ohnehin mitgehen (#878: unveränderte Beispiele), zählen nicht.
    const mitgehend = new Map<string, number>();
    for (const m of await this.repo.holeMappen(ohne)) mitgehend.set(m.typId, (mitgehend.get(m.typId) ?? 0) + 1);
    for (const id of ids) {
      const eintrag = typen.get(id);
      if (!eintrag) continue;
      const n = await this.repo.zaehleMappen(id) - (mitgehend.get(id) ?? 0);
      if (n) gruende.push(`${eintrag.name}: ${n} ${t('meldungen.dienst.mappen', { anzahl: n })}.`);
      const korb = (await this.repo.papierkorb({ typId: id })).length;
      if (korb) gruende.push(`${eintrag.name}: ${korb} im Papierkorb.`);
    }
    return gruende;
  }

  /**
   * „Wohin gehört das?“ (#937): Mappentypen, die man aus Post anlegen kann – mit dem Haken „Kann aus Post angelegt
   * werden“ (Vorgabe: mit Dokumentenregister), nie Systemtypen, und nur solche, in denen die Person anlegen darf.
   * Grundlage für die Seite „Dokument übernehmen“ (#934) und die Klassifizierung (#939).
   */
  async ausPostZiele(z?: Zugriff): Promise<Mappentyp[]> {
    const typen = z ? [...z.typen.values()] : await this.repo.listeTypen();
    return typen.filter((x) => kannAusPost(x) && (!z || z.admin || (z.paket ? z.paket.schreiben.has(x.id) : rechteUebersicht(x, z.wer, z.a).C !== 'nie')))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
}
