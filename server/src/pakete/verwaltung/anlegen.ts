/**
 * Anlegen bzw. ergänzen (`legeIntern`): Typen, Felder, Register, Ansichten, Automatisierungen und Vorgaben eines Pakets.
 * Die Schritte stehen in `anlegen-schritte.ts`, der gemeinsame Stand in `anlegen-lauf.ts` (#1278, Schritt 6a).
 */
import { randomUUID } from 'node:crypto';
import { hatSchnittstelle, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { ueberfuehre } from '../../../../shared/src/paketeinstellungen';
import type { Dienst } from '../../dienst/dienst';
import { anzeigeVorgaben, paketEinstellungen, setzePaketEinstellungen, type VorgabenErgebnis } from '../index';
import { nimmEinstellungenZurueck, type UmbauLage } from '../index';
import { sichtStandNach } from '../index';
import { mitkommtVon } from '../index';
import { vorgabeVerweis } from '../../../../shared/src/vorgaben';
import { log } from './optionen';
import { type LegeAuftrag } from './plan';
import { type AnlegeLauf, herausgeberAngaben, mitgeliefertAngaben, typStandNach, vorgabeId, ziel } from './anlegen-lauf';
import { PaketAnlegenSchritte } from './anlegen-schritte';

/** Alter Stand außerhalb der Typen: kommt bei einem Fehler zurück, wenn er geschrieben wurde. */
interface Sicherung {
  alteEinstellungen: Awaited<ReturnType<typeof paketEinstellungen>>;
  einstellungenGeschrieben: boolean;
  /** Wortlisten (#356): ersetzen die des Pakets; bei einem Fehler kommen die alten zurück. */
  alteWortlisten: string[][];
  wortlistenGeschrieben: boolean;
  /** Code (#403): Der alte Code kommt bei einem Fehler zurück – sonst liefe das alte Paket mit dem neuen Modul. */
  alterCode: Array<{ name: string; inhalt: Buffer }>;
  codeGeschrieben: boolean;
  /** Sprachpaket (#731): Die alten Texte kommen bei einem Fehler zurück. */
  alteSprache: Awaited<ReturnType<Dienst['kern']['repo']['sprachpakete']>>[number] | null;
  spracheGeschrieben: boolean;
}

/** Anlegen bzw. ergänzen. */
export abstract class PaketAnlegen extends PaketAnlegenSchritte {
  protected async legeIntern(a: LegeAuftrag): Promise<InstalliertesPaket> {
    const l = await this.bereiteVor(a);
    const s = await this.sichere(l);
    const { ids, vorher, geaendert, typMap } = l;
    const { paket } = a;
    try {
      await this.legeNeueTypen(l);
      await this.ergaenzeTypen(l);
      await this.uebergibAblageort(l);
      // 2b. Optionale Ziele (#1036): Vorhandene Felder dieses Pakets lernen neue optionale Ziele aus dem Update; dann nimmt
      // jedes Feld (auch anderer Pakete) die optionalen Ziele auf, die es jetzt gibt – etwa die Fahrzeuge, wenn das Paket
      // Fahrzeuge nach den Rechnungen kommt. Entfernt wird dabei nichts.
      await this.ergaenzeOptionaleZiele(paket, typMap, geaendert);
      // 2c. Quellen (#1122): Was jetzt geht, nachtragen; was das Paket vorsieht und nicht geht, ist ein Fehler mit Stelle.
      await this.quellenNachtragen(paket, {
        ids,
        neu: new Set(l.neueTypen.map((x) => x.schluessel)),
        vorher,
        geaendert,
        typId: (vw) => ziel(l, vw, false)!,
      });
      await this.legeSichten(l);
      await this.legeVorgabenAn(l);
      await this.bauUm(l);
      await this.legeBeispieleUndEinstellungen(l, s);
      const datensatz = await this.datensatzVon(l);
      await this.speichere(l, s, datensatz);
      await this.stoesseNachAn(l, datensatz);
      return datensatz;
    } catch (f) {
      await this.rolleZurueck(l, s);
      throw f;
    }
  }

  /** Stand vor dem Anlegen: Typen, Übernahme, Umbau, Ids, Vorgaben; dazu, was beim Zurückrollen zählt. */
  private async bereiteVor(a: LegeAuftrag): Promise<AnlegeLauf> {
    const { paket, plan, alt } = a;
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    const vorher = new Map((await this.d.mappentypen.listeTypen()).map((t) => [t.id, t] as const));
    // Übernahme des früheren Ablageorts (#883): gleiche Id, gilt als vorhanden (die Vorschau zählt ihn genauso).
    const ueb = await this.uebernahme(paket, alt);
    // Umbau (#1041): geplant in der Vorschau, die Antworten auf die Rückfragen schon eingetragen. Übernommene Typen
    // behalten ihre Id.
    const lage: UmbauLage = this.umbauLagen.get(plan) ?? {
      schritte: [],
      uebernahme: {},
    };
    const ids = new Map<string, string>(Object.entries({ ...alt?.typen, ...ueb?.typen, ...lage.uebernahme }));
    for (const t of paket.typen) if (!ids.has(t.schluessel)) ids.set(t.schluessel, randomUUID());
    const neueTypen = paket.typen.filter(
      (t) =>
        !plan.typen.find((x) => x.schluessel === t.schluessel)?.vorhanden &&
        !plan.typen.find((x) => x.schluessel === t.schluessel)?.geloescht,
    );
    const dmsTypen = await this.dmsTypen();
    // Vorgaben (#1038): Ihre Ids stehen vor den Typen fest – Anzeige-Bedingungen „zeigt auf die Vorgabe …“ nennen sie schon.
    const vorgabenJetzt = await this.vorgabenLage(paket, alt);
    const fremdeVorgaben = new Map<string, string | null>();
    for (const ty of paket.typen) {
      for (const vw of anzeigeVorgaben(ty).flatMap((b) => b.verweise)) {
        if (vorgabeVerweis(vw, m.id).paket !== m.id && !fremdeVorgaben.has(vw))
          fremdeVorgaben.set(vw, (await this.vorgabeMappe(vw, m.id))?.id ?? null);
      }
    }
    const vorgabenErg: VorgabenErgebnis = {
      vorgaben: {},
      ergaenzungen: [],
      angelegt: [],
      rueck: [],
      ausgelassen: [],
    };
    return {
      a,
      m,
      installierte,
      vorher,
      ueb,
      lage,
      ids,
      neueTypen,
      angelegt: new Set<string>(),
      beispielIds: new Map<string, string>(),
      dmsTypen,
      vorgabenJetzt,
      fremdeVorgaben,
      vorgabenErg,
      // Stand der Typen beim Anlegen (#1122): Eine Quelle kommt erst dazu, wenn ihr Feld auf den neuen Typ zeigen darf.
      stand: new Map(vorher),
      mappen: [],
      beispielStaende: [],
      neueSichten: [],
      ersetzteSichten: [],
      sichtGeschrieben: new Set<string>(),
      ersetzenGewuenscht: this.sichtenErsetzen.get(plan) ?? new Set<string>(),
      geaendert: [],
      abschnittRegister: new Map<string, Set<string>>(),
      kennungZurueck: new Map<string, string>(),
      typMap: { ...(alt?.typen ?? {}), ...ueb?.typen },
      sichtMap: { ...(alt?.sichten ?? {}), ...ueb?.sichten },
      umbauErg: null,
      typWahl: this.typWahl.get(plan) ?? { ersetzen: new Set<string>(), behalten: new Set<string>() },
      teileGeschrieben: new Map(),
      werteAuftraege: [],
    };
  }

  /** Alte Einstellungen, Wortlisten, Code und Sprachtexte – für den Fehlerfall. */
  private async sichere({ m, a }: AnlegeLauf): Promise<Sicherung> {
    const { alt } = a;
    const alteEinstellungen = await paketEinstellungen(this.d.kern, m.id);
    const alteWortlisten = alt ? await this.d.suche.paketSynonyme(m.id) : [];
    const alterCode = alt?.laeufer ? await this.d.kern.repo.paketCode(m.id) : [];
    const alteSprache = alt?.sprache ? ((await this.d.kern.repo.sprachpakete()).find((x) => x.paketId === m.id) ?? null) : null;
    return {
      alteEinstellungen,
      einstellungenGeschrieben: false,
      alteWortlisten,
      wortlistenGeschrieben: false,
      alterCode,
      codeGeschrieben: false,
      alteSprache,
      spracheGeschrieben: false,
    };
  }

  /** 4. Beispiele (nur bei der Installation, auf Wunsch), dann Einstellungen und Wortlisten. */
  private async legeBeispieleUndEinstellungen(l: AnlegeLauf, s: Sicherung) {
    const { m, a, mappen, beispielIds, installierte } = l;
    const { paket, alt, beispiele, von } = a;
    if (beispiele && !alt) {
      await this.legeBeispielMappen({
        paket,
        ziel: (vw) => ziel(l, vw, false)!,
        vorgabeId: (vw) => vorgabeId(l, vw),
        installierte,
        von,
        mappen,
        beispielIds,
      });
      // Stand direkt nach dem Anlegen (#878): Unveränderte Beispiele lassen sich später samt Dokumenten entfernen.
      l.beispielStaende = await this.d.beispielMappen.beispielStand(mappen);
    }
    // Einstellungen (#197): Vorgaben setzen bzw. überführen; nach dem Entfernen behaltene Werte zählen.
    if (paket.einstellungen) {
      const vorher = s.alteEinstellungen ?? { werte: {} };
      const { werte } = ueberfuehre(paket.einstellungen, s.alteEinstellungen ? vorher.werte : {});
      await setzePaketEinstellungen(this.d.kern, m.id, { ...vorher, werte });
      s.einstellungenGeschrieben = true;
    } else if (s.alteEinstellungen && alt) {
      await setzePaketEinstellungen(this.d.kern, m.id, null);
      s.einstellungenGeschrieben = true;
    }
    if (paket.wortlisten.length || s.alteWortlisten.length) {
      s.wortlistenGeschrieben = true;
      await this.d.suche.setzePaketSynonyme(m.id, paket.wortlisten);
    }
  }

  /** Eintrag des Pakets mit Paketstand der Typen (#653), Ansichten (#1125) und dem, was mitkommt (#1047). */
  private async datensatzVon(l: AnlegeLauf): Promise<InstalliertesPaket> {
    const { m, a, typMap, sichtMap, sichtGeschrieben, umbauErg } = l;
    const { paket, plan, alt, herkunft, von } = a;
    const jetzt = new Date().toISOString();
    const nachher = new Map((await this.d.mappentypen.listeTypen()).map((t) => [t.id, t] as const));
    const typStand = typStandNach(l, nachher);
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      beschreibung: m.beschreibung,
      lizenz: m.lizenz,
      autor: m.autor,
      herkunft,
      ...herausgeberAngaben(l, this.katalogUrl),
      installiert: alt?.installiert ?? jetzt,
      installiertVon: alt ? alt.installiertVon : von.email,
      aktualisiert: alt ? jetzt : null,
      aktualisiertVon: alt ? von.email : null,
      typen: typMap,
      sichten: sichtMap,
      abhaengigkeiten: m.abhaengigkeiten,
      // Ansichten mit Prüfwert (#1125): ein späteres Update ersetzt nur, was noch so ist.
      sichtStand: sichtStandNach({
        sichten: paket.sichten,
        alt,
        ids: sichtMap,
        geschrieben: sichtGeschrieben,
        zustand: (k) => plan.sichten.find((x) => x.schluessel === k)?.zustand,
        jetzt: await this.d.sichtenVerwaltung.listeSichten(),
        umbau: umbauErg?.sichten,
      }),
      ...mitgeliefertAngaben(l),
      // Was mitkommt und Kurzanleitung (#1047): für die Paketseite, wie diese Version sie mitbringt.
      mitkommt: mitkommtVon(
        paket,
        plan,
        this.mitkommtNamen(paket, await this.d.kern.repo.listePakete(), await this.d.mappentypen.listeTypen()),
        false,
      ),
      ...(paket.kurzanleitung ? { kurzanleitung: paket.kurzanleitung } : {}),
      // Rundgänge und Tipps (#831, #832): wie diese Version sie mitbringt; vorher = Version vor diesem Update.
      ...(paket.entdecken ? { entdecken: { ...paket.entdecken, vorher: alt?.version ?? null } } : {}),
      // Regionspaket (#1696): Regeln dieser Version; ein Update ohne die Datei nimmt sie weg (Kern rechnet wieder selbst).
      ...(paket.region ? { region: paket.region } : {}),
      typStand,
      // Angehalten (#1563) bleibt angehalten, auch nach einem Update.
      ...(alt?.angehalten ? { angehalten: alt.angehalten } : {}),
    };
  }

  /** Code, Sprachpaket und Eintrag speichern. */
  private async speichere(l: AnlegeLauf, s: Sicherung, datensatz: InstalliertesPaket) {
    const { m, a, ueb } = l;
    const { paket, alt } = a;
    // Code (#338): ersetzt den bisherigen; ohne Code im neuen Paket fällt er weg.
    if (paket.code || alt?.laeufer) s.codeGeschrieben = true;
    if (paket.code) await this.d.kern.repo.speicherePaketCode(m.id, paket.code.dateien);
    else if (alt?.laeufer) await this.d.kern.repo.loeschePaketCode(m.id);
    // Sprachpaket (#731): Texte und Beschriftungen neben dem Eintrag; ersetzt die der alten Version.
    if (paket.sprache || alt?.sprache) s.spracheGeschrieben = true;
    if (paket.sprache)
      await this.d.kern.repo.speichereSprachpaket(m.id, {
        kennung: paket.sprache.angabe.kennung,
        texte: paket.sprache.texte,
        beschriftungen: paket.sprache.beschriftungen,
      });
    else if (alt?.sprache) await this.d.kern.repo.loescheSprachpaket(m.id);
    await this.d.kern.repo.speicherePaket(datensatz);
    if (ueb)
      log.info('Ablageort an das Paket übergeben', {
        paket: m.id,
        typ: ueb.name,
        ansichten: Object.keys(ueb.sichten).length,
      });
  }

  /** Nach dem Speichern: Automatisierungen, Läufer, Sprache und was an neue Schnittstellen des Pakets geht. */
  private async stoesseNachAn(l: AnlegeLauf, datensatz: InstalliertesPaket) {
    const { m, a } = l;
    const { paket, alt, ein } = a;
    // #712: mitgelieferte Automatisierungen – aus, außer denen, die beim Installieren angehakt wurden (nach dem
    // Speichern, damit Typen und Herkunft stimmen).
    await Promise.resolve(this.d.paketAutomatisierungen?.(datensatz, paket.automatisierungen, ein)).catch((e: Error) =>
      log.warn('Automatisierungen des Pakets nicht angelegt', {
        paket: m.id,
        fehler: e.message,
      }),
    );
    // #1044: mitgelieferte Automatisierungsvorlagen – sofort im Menü „Mappe“; überlagert eine die Kern-Vorgabe, gilt sie.
    await this.d.ablaeufe.ausPaket(datensatz, paket.ablaufvorlagen ?? []).catch((e: Error) =>
      log.warn('Automatisierungsvorlagen des Pakets nicht angelegt', {
        paket: m.id,
        fehler: e.message,
      }),
    );
    if (paket.code || alt?.laeufer) await this.spaeter(() => Promise.resolve(this.o.laeufer?.codeGeaendert?.()).catch(() => {}));
    // #1658: Werte entfallener Felder im Hintergrund in die Notiz bzw. ins neue Feld – erst nach dem Speichern.
    if (l.werteAuftraege.length)
      await this.spaeter(() =>
        this.d.updateWerte
          .einreihen(l.werteAuftraege)
          .catch((e: Error) => log.error('Paket-Update: Werte entfallener Felder nicht eingereiht', { paket: m.id, fehler: e.message })),
      );
    // Sprachpaket (#731): Sprache sofort in diesem Prozess (die anderen lesen sie binnen einer Minute), dann Beschriftungen
    // der Standardpakete – beim Sprachpaket für alle installierten Pakete, sonst die installierten Sprachen für dieses.
    if (paket.sprache || alt?.sprache)
      await this.spaeter(() =>
        Promise.resolve(this.o.sprachen?.geaendert()).catch((e: Error) =>
          log.warn('Sprachpaket nicht geladen', {
            paket: m.id,
            fehler: e.message,
          }),
        ),
      );
    await this.sprachBeschriftungen(paket.sprache ? undefined : [m.id]).catch((e: Error) =>
      log.warn('Beschriftungen aus Sprachpaketen nicht übernommen', {
        paket: m.id,
        fehler: e.message,
      }),
    );
    this.meldeSchnittstellen(l, datensatz);
  }

  /** Texterkennung, Umwandeln, Volltext und Archivfassung: was ohne das Paket wartete bzw. schon da ist, geht an es. */
  private meldeSchnittstellen({ m, a }: AnlegeLauf, datensatz: InstalliertesPaket) {
    const { alt } = a;
    // Texterkennung als Paket (#459): Was ohne Paket wartete, geht jetzt an das neue Paket.
    if (hatSchnittstelle(datensatz.laeufer, 'dms:texterkennung') && !hatSchnittstelle(alt?.laeufer, 'dms:texterkennung')) {
      void this.spaeter(() =>
        this.d.volltexte.texterkennungPaketDa().catch((e: Error) =>
          log.warn('Wartende Dokumente nicht an die Texterkennung gegeben', {
            paket: m.id,
            fehler: e.message,
          }),
        ),
      );
    }
    // Dateien umwandeln (#577): Vorhandene Dateien der (neuen) Dateitypen gehen an das Paket.
    const neueDateitypen = (datensatz.laeufer?.umwandeln ?? []).filter(
      (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:umwandeln') && alt?.laeufer?.umwandeln?.includes(x)),
    );
    if (hatSchnittstelle(datensatz.laeufer, 'dms:umwandeln') && neueDateitypen.length) {
      void this.spaeter(() =>
        this.d.dokumentUmwandlung.umwandelPaketDa(neueDateitypen).catch((e: Error) =>
          log.warn('Vorhandene Dateien nicht zum Umwandeln gemeldet', {
            paket: m.id,
            fehler: e.message,
          }),
        ),
      );
    }
    // Volltext aus Paketen (#614): Vorhandene Dateien der (neuen) Dateitypen ohne Text gehen an das Paket.
    const neueVolltextTypen = (datensatz.laeufer?.volltext ?? []).filter(
      (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:volltext') && alt?.laeufer?.volltext?.includes(x)),
    );
    if (hatSchnittstelle(datensatz.laeufer, 'dms:volltext') && neueVolltextTypen.length) {
      void this.spaeter(() =>
        this.d.volltextAusPaketen
          .volltextPaketDa(neueVolltextTypen)
          .catch((e: Error) => log.warn('Vorhandene Dateien nicht zum Volltext an das Paket gegeben', { paket: m.id, fehler: e.message })),
      );
    }
    // Archivfassung (#631): Bestand der (neuen) Dateitypen mit fertigem Volltext geht an das Paket.
    const neueArchivTypen = (datensatz.laeufer?.archivfassung?.typen ?? []).filter(
      (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:archivfassung') && alt?.laeufer?.archivfassung?.typen.includes(x)),
    );
    if (hatSchnittstelle(datensatz.laeufer, 'dms:archivfassung') && neueArchivTypen.length) {
      void this.spaeter(() =>
        this.d.dokumentArchiv.archivPaketDa(neueArchivTypen).catch((e: Error) =>
          log.warn('Vorhandene Dokumente nicht zur Archivfassung gemeldet', {
            paket: m.id,
            fehler: e.message,
          }),
        ),
      );
    }
  }

  /** Zurückrollen: angelegte Mappen, Sichten, Typen; geänderte Typen auf den alten Stand. */
  private async zurueck(l: AnlegeLauf) {
    const { kennungZurueck, vorgabenErg, mappen, ersetzteSichten, neueSichten, angelegt, ids, geaendert } = l;
    for (const [id, k] of kennungZurueck) await this.d.kern.repo.setzeTypKennung(id, k).catch(() => {});
    // Vorgaben (#1038): Vorlagen und geänderte Werte zurück, neue Vorgaben weg (nach den Beispielen, die auf sie zeigen).
    for (const r of vorgabenErg.rueck) await r().catch(() => {});
    await this.d.loeschen.entferneMappenEndgueltig(mappen).catch(() => {});
    await this.d.loeschen.entferneMappenEndgueltig(vorgabenErg.angelegt).catch(() => {});
    for (const s of ersetzteSichten) await this.d.sichtenVerwaltung.aendereSicht(s.id, s).catch(() => {});
    for (const s of [...neueSichten].reverse()) await this.d.sichtenVerwaltung.loescheSicht(s).catch(() => {});
    for (let runde = 0; runde < 3; runde++)
      for (const s of [...angelegt].reverse()) {
        const id = ids.get(s)!;
        await this.d.mappentypen.loescheTyp(id).then(
          () => angelegt.delete(s),
          () => {},
        );
      }
    for (const t of geaendert) await this.d.mappentypen.aendereTyp(t.id, t).catch(() => {});
  }

  /** Fehler beim Anlegen: alles zurück, was geschrieben wurde. */
  private async rolleZurueck(l: AnlegeLauf, s: Sicherung) {
    const { m, lage, umbauErg } = l;
    // In der Transaktion (#1385; mit Umbau schon vorher) nimmt sie alles in der Datenbank zurück; außerhalb liegen nur
    // die Einstellungen. Ohne Transaktion (Aufruf von außen) wie bisher Schritt für Schritt.
    if (!lage.schritte.length && !this.d.kern.inEigenerTransaktion()) await this.zurueck(l);
    // Die Transaktion nimmt nur die Datenbank zurück: Dateien der Beispiel-Mappen und Vorgaben gehen hier mit weg.
    else if (this.d.kern.inEigenerTransaktion()) {
      await this.d.loeschen.entferneMappenEndgueltig(l.mappen).catch(() => {});
      await this.d.loeschen.entferneMappenEndgueltig(l.vorgabenErg.angelegt).catch(() => {});
    }
    if (umbauErg)
      await nimmEinstellungenZurueck(this.d, umbauErg.einstellungenVorher).catch((e) =>
        log.error('Umbau: Einstellungen nicht zurückgenommen', {
          paket: m.id,
          fehler: (e as Error).message,
        }),
      );
    if (s.codeGeschrieben)
      await (s.alterCode.length ? this.d.kern.repo.speicherePaketCode(m.id, s.alterCode) : this.d.kern.repo.loeschePaketCode(m.id)).catch(
        (e) =>
          log.error('Paket: alten Code nicht wiederhergestellt', {
            paket: m.id,
            fehler: (e as Error).message,
          }),
      );
    if (s.spracheGeschrieben)
      await (s.alteSprache ? this.d.kern.repo.speichereSprachpaket(m.id, s.alteSprache) : this.d.kern.repo.loescheSprachpaket(m.id)).catch(
        (e) =>
          log.error('Sprachpaket: alte Texte nicht wiederhergestellt', {
            paket: m.id,
            fehler: (e as Error).message,
          }),
      );
    if (s.einstellungenGeschrieben) await setzePaketEinstellungen(this.d.kern, m.id, s.alteEinstellungen).catch(() => {});
    if (s.wortlistenGeschrieben) await this.d.suche.setzePaketSynonyme(m.id, s.alteWortlisten).catch(() => {});
  }
}
