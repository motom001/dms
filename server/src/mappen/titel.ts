/**
 * Titel der Mappen (#1074 aus dienst.ts): gespeicherte Titel berechnen und nachziehen, Titel vorab beim Ändern (#743),
 * Wartung beim Start (Haken #146, Kennungen #145, „ehemalig“ #663) und „Absender bereinigen“ (#494). Schicht 2.
 */
import { auswahlText, freierSchluessel, type Mappe, type Mappentyp, POST_KANAL, POST_RICHTUNG, titelAus, verweiseVon, type Werte } from '../../../shared/src/model';
import { setzeZusammengesetzte } from '../../../shared/src/zusammengesetzt';
import { istOffen, kurzStandard, RECHTE_LISTE, regelwerkVon } from '../../../shared/src/rechte';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { MappenHistorie } from './historie';

export class MappenTitel {
  constructor(private readonly kern: Kern, private readonly historie: MappenHistorie) {}

  private get repo(): Repo { return this.kern.repo; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.historie.notiere(...a); }
  private aenderungen(...a: Parameters<MappenHistorie['aenderungen']>) { return this.historie.aenderungen(...a); }

  async titel(m: Mappe): Promise<string> {
    return m.titel || titelAus(await this.repo.holeTyp(m.typId), m.werte, undefined, m) || t('meldungen.dienst.ohne-titel');
  }

  /* ---------- Titel ---------- */

  /**
   * Berechnet die gespeicherten Titel der angegebenen Mappen neu. Ändert sich ein Titel,
   * werden die Mappen nachgezogen, die auf sie verweisen (deren Titel kann ihn enthalten).
   * Bei Verweisen im Kreis endet das nach einigen Runden.
   */
  async aktualisiereTitel(ids: string[]): Promise<Map<string, string>> {
    const neu = new Map<string, string>();
    if (!ids.length) return neu;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let offen = [...new Set(ids)];
    for (let runde = 0; offen.length && runde < 6; runde++) {
      const geaendert: Array<{ id: string; titel: string }> = [];
      for (let i = 0; i < offen.length; i += 2000) {
        const mappen = await this.repo.holeMappen(offen.slice(i, i + 2000));
        const ziele = mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
        const gespeichert = await this.repo.titelVon(ziele.filter((z) => !neu.has(z)));
        const titelVon = (z: string) => neu.get(z) || gespeichert.get(z) || t('meldungen.dienst.ohne-titel');
        for (const m of mappen) {
          const t = titelAus(typen.get(m.typId), m.werte, titelVon, m);
          neu.set(m.id, t);
          if (t !== m.titel) geaendert.push({ id: m.id, titel: t });
        }
      }
      await this.repo.setzeTitel(geaendert);
      offen = geaendert.length ? await this.repo.quellenVon(geaendert.map((g) => g.id)) : [];
    }
    return neu;
  }

  /** Beim Start: Titel berechnen, die noch fehlen (z. B. nach dem Update auf eine Version mit gespeicherten Titeln). */
  /**
   * Die Haken „Neue Mappen erlauben“ und „Löschen erlauben“ in die Berechtigungen überführen (#146),
   * ohne dass Benutzer danach mehr dürfen: Standard C bzw. D ✗, Regeln verlieren genau dieses ✓.
   */
  async hakenUeberfuehren(): Promise<number> {
    let n = 0;
    for (const t of await this.repo.listeTypen()) {
      if (t.system || (t.erstellenErlaubt !== false && t.loeschenErlaubt !== false)) continue;
      const rw = structuredClone(regelwerkVon(t));
      const ohneC = t.erstellenErlaubt === false; const ohneD = t.loeschenErlaubt === false;
      if (ohneC) rw.grund.C = false;
      if (ohneD) rw.grund.D = false;
      const geaendert: string[] = [];
      for (const r of rw.regeln) {
        if (ohneC && r.dann.C === 'erteilen') { delete r.dann.C; geaendert.push(`${r.name}: ohne +C`); }
        if (ohneD && r.dann.D === 'erteilen') { delete r.dann.D; geaendert.push(`${r.name}: ohne +D`); }
      }
      // Regeln, die danach nichts mehr tun, fallen weg.
      const weg = rw.regeln.filter((r) => !RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp).map((r) => r.name);
      rw.regeln = rw.regeln.filter((r) => RECHTE_LISTE.some((k) => r.dann[k]) || r.stopp);
      await this.repo.aendereTyp(t.id, { ...t, erstellenErlaubt: true, loeschenErlaubt: true });
      await this.repo.setzeBerechtigungen(t.id, istOffen(rw) ? null : rw);
      protokoll.modul('werkbank').warn('Haken „Neue Mappen/Löschen erlauben“ in die Berechtigungen übernommen', {
        typ: t.name, standard: kurzStandard(rw.grund), ...(geaendert.length ? { regeln: geaendert.join(' · ') } : {}), ...(weg.length ? { entfallen: weg.join(', ') } : {}),
      });
      n++;
    }
    return n;
  }

  /** Schlüssel für Mappentypen ohne (nach dem Update auf 0.31, #145): Systemtypen zuerst, dann aus dem Namen. */
  async typSchluesselNachziehen(): Promise<number> {
    const typen = await this.repo.listeTypen();
    const vergeben = new Set(typen.map((t) => t.schluessel ?? '').filter(Boolean));
    let n = 0;
    for (const t of typen.filter((x) => !x.schluessel).sort((a, b) => Number(!a.system) - Number(!b.system))) {
      const k = freierSchluessel(t.system ?? t.name, vergeben);
      vergeben.add(k);
      await this.repo.setzeTypSchluessel(t.id, k);
      n++;
    }
    if (n) protokoll.modul('werkbank').info('Kennungen für Mappentypen vergeben', { anzahl: n });
    return n;
  }

  /**
   * Wartung „Absender bereinigen“ (#494): Bis 0.99 bekam eingehende Post ohne Absender den Namen dessen,
   * der sie angelegt hat (beim Eingangsordner „Eingangsordner“). Gesucht wird eingehende Post aus
   * Hochladen, API, WebDAV und Eingangsordner, deren Absender genau so lautet. Postfach-Abrufe und
   * versendete Post bleiben außen vor – dort kommt der Absender aus der E-Mail bzw. ist richtig.
   */
  async absenderVorschau(): Promise<{ posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> }> {
    const typ = (await this.kern.system()).post;
    const kanaele = new Set<string>([POST_KANAL.hochgeladen, POST_KANAL.api, POST_KANAL.webdav, POST_KANAL.ordner]);
    const kandidaten = (await this.repo.listeMappen(typ.id)).filter((m) => auswahlText(m.werte.richtung) === POST_RICHTUNG.eingehend
      && kanaele.has(auswahlText(m.werte.kanal)) && typeof m.werte.absender === 'string' && m.werte.absender.trim() !== '');
    const namen = new Map<string, string>();
    const posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> = [];
    for (const m of kandidaten) {
      const absender = String(m.werte.absender).trim();
      let passt = auswahlText(m.werte.kanal) === POST_KANAL.ordner && absender === 'Eingangsordner';
      if (!passt && m.erstelltVon) {
        if (!namen.has(m.erstelltVon)) namen.set(m.erstelltVon, await this.kern.name(m.erstelltVon));
        passt = absender === namen.get(m.erstelltVon);
      }
      if (passt) posten.push({ id: m.id, titel: m.titel ?? '', absender, kanal: auswahlText(m.werte.kanal), erstellt: m.erstellt });
    }
    posten.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
    return { posten };
  }

  /** Absender der gewählten Posts leeren (#494) – nur, wenn sie noch zur Vorschau passen; mit Eintrag in der Historie. */
  async absenderBereinigen(ids: unknown, von: { id: string | null; email: string }): Promise<{ bereinigt: number }> {
    const gewaehlt = new Set(Array.isArray(ids) ? ids.map(String) : []);
    if (!gewaehlt.size) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-post'));
    const typ = (await this.kern.system()).post;
    const passend = (await this.absenderVorschau()).posten.filter((p) => gewaehlt.has(p.id));
    for (const p of passend) {
      const m = await this.repo.holeMappe(p.id);
      if (!m) continue;
      const werte = { ...m.werte, absender: null };
      setzeZusammengesetzte(typ, werte);
      await this.inTransaktion(async () => {
        const neu = await this.repo.aendereMappe(m.id, werte, [], von.id, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
        await this.notiere(m.id, von.id, 'geaendert', {
          stand: neu.geaendert,
          aenderungen: await this.aenderungen(typ, m.werte, werte),
          text: t('meldungen.dienst.absender-bereinigt-wartung-er'),
        });
      });
      await this.aktualisiereTitel([m.id]);
    }
    protokoll.modul('werkbank').info('Absender bereinigt', { von: von.email, anzahl: passend.length });
    return { bereinigt: passend.length };
  }

  async titelNachziehen(): Promise<number> {
    const ids = await this.repo.ohneTitel();
    await this.aktualisiereTitel(ids);
    return ids.length;
  }

  /**
   * Beim Start (#663): Bis 0.159 hieß die Mappe eines deaktivierten Benutzers „… (ehemalig)“. Diese Titel
   * aus der Vorlage neu berechnen – samt Mappen, deren Titel den Namen enthält. Danach findet sich nichts mehr.
   */
  async ehemaligZuruecksetzen(): Promise<number> {
    const typ = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    if (!typ) return 0;
    const ids = (await this.repo.listeMappen(typ.id)).filter((m) => m.werte.aktiv === false && / \(ehemalig\)$/.test(m.titel ?? '')).map((m) => m.id);
    if (ids.length) await this.aktualisiereTitel(ids);
    return ids.length;
  }

  /**
   * Titel einer Mappe, bevor sie geschrieben wird (#743): mit den Titeln der Mappen, auf die die Werte verweisen.
   * Die Funktion liefert undefined, wenn die geschriebenen Werte auf eine Mappe verweisen, deren Titel nicht vorab
   * gelesen wurde (jemand hat inzwischen einen Verweis gesetzt) – dann rechnet `aktualisiereTitel` danach wie bisher.
   */
  async titelVorab(typ: Mappentyp, werte: Werte, m: Mappe): Promise<(w: Werte) => string | undefined> {
    const ziele = [...new Set([...verweiseVon(typ, werte), ...verweiseVon(typ, m.werte)].map((v) => v.zielId))];
    const titel = await this.repo.titelVon(ziele.filter(istUuid));
    // „Zuletzt geändert“ im Titel ({geaendert}) zeigt den Tag des Speicherns.
    const index = { ...m, geaendert: new Date().toISOString() };
    return (w) => (verweiseVon(typ, w).every((v) => titel.has(v.zielId) || !istUuid(v.zielId))
      ? titelAus(typ, w, (x) => titel.get(x) || t('meldungen.dienst.ohne-titel'), index) : undefined);
  }
}
