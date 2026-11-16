/**
 * Pakete entfernen: Beispiel-Mappen (#878), Vorgaben (#1038), Sprachen und Tabellen.
 */
import { type Feld, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { hatSchnittstelle, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { type Sicht } from '../../../../shared/src/sichten';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { nachweis } from '../../protokoll/nachweisjournal';
import { setzePaketEinstellungen, setzePaketSpeicher, vorgabeMappen } from '../index';
import { type VorgabeFrage } from '../../../../shared/src/vorgaben';
import { meldungen, ohneZiele } from './hilfen';
import { type Handelnder, log } from './optionen';
import { PaketEinstellungen } from './einstellungen';

/** Entfernen. */
export abstract class PaketEntfernen extends PaketEinstellungen {
  /** Tabellen (#1030) der Typen aus `bleibt` entfernen, die Mappen anderer Typen aus `bleibt` zeigen; true, wenn es welche gab. */
  private async ohneTabellenAuf(typen: Mappentyp[], bleibt: Set<string>): Promise<boolean> {
    const weg = (t: Mappentyp, f: Feld) => f.typ === 'tabelle' && !!f.quelle && bleibt.has(f.quelle.typId) && f.quelle.typId !== t.id;
    const betroffen = typen.filter((x) => bleibt.has(x.id) && x.felder.some((f) => weg(x, f)));
    for (const t of betroffen) await this.d.mappentypen.aendereTyp(t.id, { ...t, felder: t.felder.filter((f) => !weg(t, f)) });
    return betroffen.length > 0;
  }

  /**
   * Vorgaben eines Pakets beim Entfernen (#1038): Was benutzt wird – Verweise anderer Mappen, Notizen, Dokumente, die
   * nicht vom Paket kommen –, bleibt. Unbenutzte in eigenen Typen gehen mit dem Typ; in Typen anderer Pakete erst nach
   * Rückfrage. Verweisen Vorgaben aufeinander, zählt nur, was von außen kommt (bis nichts mehr dazukommt).
   */
  private async vorgabenBeimEntfernen(p: InstalliertesPaket, eigeneTypen: Set<string>, auchWeg: string[]) {
    const repo = this.d.kern.repo;
    const mappen = await vorgabeMappen(this.d, p.id);
    if (!mappen.length)
      return { eigenWeg: [] as string[], eigenBenutzt: [] as Mappe[], frage: [] as VorgabeFrage[], fremdBenutzt: [] as Mappe[] };
    const vonPaketen = new Set([
      ...Object.values(p.vorgaben ?? {}).flatMap((v) => (v.vorlagen ?? []).map((x) => x.dokument)),
      ...(await repo.listePakete()).flatMap((x) => (x.ergaenzungen ?? []).flatMap((e) => e.vorlagen.map((v) => v.dokument))),
    ]);
    const eigenesHat = new Map<string, boolean>();
    for (const m of mappen) {
      const fremdeDoks = (await repo.listeDokumente(m.id)).some((d) => !vonPaketen.has(d.id));
      eigenesHat.set(m.id, fremdeDoks || (await repo.notizen(m.id)).length > 0);
    }
    const rueck = new Map<string, string[]>();
    for (const m of mappen)
      rueck.set(
        m.id,
        (await repo.rueckverweise(m.id)).map((r) => r.quelleId),
      );
    const weg = new Set(mappen.filter((m) => !eigenesHat.get(m.id)).map((m) => m.id));
    const draussen = (q: string) => !weg.has(q) && !auchWeg.includes(q);
    for (let geaendert = true; geaendert;) {
      geaendert = false;
      for (const m of mappen)
        if (weg.has(m.id) && rueck.get(m.id)!.some(draussen)) {
          weg.delete(m.id);
          geaendert = true;
        }
    }
    const typen = new Map((await this.d.mappentypen.listeTypen()).map((x) => [x.id, x] as const));
    const eigen = (m: Mappe) => eigeneTypen.has(m.typId);
    return {
      eigenWeg: mappen.filter((m) => eigen(m) && weg.has(m.id)).map((m) => m.id),
      eigenBenutzt: mappen.filter((m) => eigen(m) && !weg.has(m.id)),
      frage: mappen
        .filter((m) => !eigen(m) && weg.has(m.id))
        .map((m): VorgabeFrage => ({ id: m.id, titel: m.titel || m.id, typ: typen.get(m.typId)?.name ?? '' })),
      fremdBenutzt: mappen.filter((m) => !eigen(m) && !weg.has(m.id)),
    };
  }

  /** Sprachpaket in Gebrauch (#731): ohne Bestätigung nicht entfernen – 409 mit den Betroffenen. */
  private async spracheInGebrauch(p: InstalliertesPaket) {
    if (!p.sprache) return;
    const n = (await this.o.sprachen?.nutzung(p.sprache.kennung)) ?? { personen: 0, standard: false };
    if (!n.personen && !n.standard) return;
    const gruende = [
      ...(n.personen ? [t('meldungen.sprachpakete.entfernen.personen', { anzahl: n.personen })] : []),
      ...(n.standard ? [t('meldungen.sprachpakete.entfernen.standard')] : []),
    ];
    throw new Fachfehler(409, t('meldungen.sprachpakete.entfernen.frage', { name: p.name }), {
      gruende,
      sprache: { kennung: p.sprache.kennung, ...n },
    });
  }

  /**
   * Vorgaben beim Entfernen (#1038): die genannten Vorgabe-Mappen endgültig (Löschprotokoll „Vorgaben“), dazu die
   * Vorlagen, die das Paket an Vorgaben anderer Pakete gehängt hat – nur diese, nur an der Mappe, an die es sie hängte.
   */
  private async entferneVorgaben(p: InstalliertesPaket, weg: string[], von: Handelnder): Promise<string[]> {
    if (weg.length) await this.d.beispielMappen.entferneBeispielMappen(weg, von.id, 'vorgaben');
    for (const e of p.ergaenzungen ?? []) {
      for (const v of e.vorlagen) {
        if ((await this.d.kern.repo.holeDokument(v.dokument))?.mappeId !== e.mappe) continue;
        await this.d.dokumente
          .loescheDokument(v.dokument, von.id, { weg: 'dokument' })
          .catch((x: Error) => log.warn('Vorlage des Pakets nicht entfernt', { paket: p.id, dokument: v.dokument, fehler: x.message }));
      }
    }
    return weg;
  }

  /**
   * Paket entfernen. Unveränderte Beispiel-Mappen (#878) gehen samt Dokumenten mit; geänderte bleiben – in eigenen
   * Mappentypen verhindern sie das Entfernen und stehen in den Gründen, in fremden bleiben sie und stehen im Ergebnis.
   * Vorgaben (#1038): benutzte bleiben (in eigenen Typen verhindern sie das Entfernen), unbenutzte in Typen anderer
   * Pakete nur mit `vorgaben` („entfernen“ oder „behalten“) – ohne Angabe fragt Ablago (409 mit `vorgaben`). Vorlagen,
   * die das Paket an Vorgaben anderer Pakete gehängt hat, gehen mit – nur diese.
   */
  async entferne(
    id: string,
    von: Handelnder,
    behalten = false,
    spracheBestaetigt = false,
    vorgabenWahl?: 'entfernen' | 'behalten',
  ): Promise<{
    beispieleBehalten: Array<{ id: string; titel: string; grund: 'geaendert' | 'verwiesen' }>;
    vorgabenBehalten: Array<{ id: string; titel: string }>;
  }> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    // Fassungen (#1006): Was das Entfernen löscht oder ändert, steht „durch Paket <Name> <Version>“ im Verlauf.
    return this.d.kern.mitFassungsKontext({ urheber: { art: 'paket', id, name: p.name, version: p.version, person: von.id } }, () =>
      this.entferneIntern(id, von, behalten, spracheBestaetigt, vorgabenWahl),
    );
  }

  private async entferneIntern(
    id: string,
    von: Handelnder,
    behalten: boolean,
    spracheBestaetigt: boolean,
    vorgabenWahl?: 'entfernen' | 'behalten',
  ): Promise<{
    beispieleBehalten: Array<{ id: string; titel: string; grund: 'geaendert' | 'verwiesen' }>;
    vorgabenBehalten: Array<{ id: string; titel: string }>;
  }> {
    const alle = await this.d.kern.repo.listePakete();
    const p = alle.find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (!spracheBestaetigt) await this.spracheInGebrauch(p);
    const gruende: string[] = alle
      .filter((x) => x.id !== id && id in x.abhaengigkeiten)
      .map((x) => t('meldungen.pakete.das-paket-braucht', { name: x.name, name2: p.name }));
    const typIds = Object.values(p.typen);
    // Beispiel-Mappen (#878): unveränderte gehen mit, geänderte in eigenen Mappentypen werden als Grund genannt.
    const bsp = await this.d.beispielMappen.pruefeBeispiele(p.beispielMappen ?? []);
    const eigeneTypen = new Set(typIds);
    gruende.push(
      ...bsp.geaendert
        .filter((g) => eigeneTypen.has(g.typId))
        .map((g) =>
          g.grund === 'verwiesen'
            ? t('meldungen.pakete.beispiel-behalten.verwiesen', { titel: g.titel })
            : t('meldungen.pakete.beispiel-behalten.geaendert', { titel: g.titel }),
        ),
    );
    const vg = await this.vorgabenBeimEntfernen(p, eigeneTypen, bsp.unveraendert);
    gruende.push(...vg.eigenBenutzt.map((m) => t('meldungen.pakete.vorgaben.benutzt', { titel: m.titel || m.id })));
    gruende.push(
      ...(await this.d.mappentypen.belegteTypen(typIds, [...bsp.unveraendert, ...vg.eigenWeg, ...vg.eigenBenutzt.map((m) => m.id)])),
    );
    if (gruende.length) throw new Fachfehler(409, t('meldungen.pakete.laesst-sich-noch-nicht', { name: p.name }), { gruende });
    if (vg.frage.length && !vorgabenWahl)
      throw new Fachfehler(409, t('meldungen.pakete.vorgaben.entfernen-frage', { name: p.name, anzahl: vg.frage.length }), {
        vorgaben: vg.frage,
      });
    if (bsp.unveraendert.length) await this.d.beispielMappen.entferneBeispielMappen(bsp.unveraendert, von.id);
    const vorgabenWeg = await this.entferneVorgaben(
      p,
      [...vg.eigenWeg, ...(vorgabenWahl === 'entfernen' ? vg.frage.map((x) => x.id) : [])],
      von,
    );
    // Untersichten zuerst, dann die Typen (Verweise untereinander: mehrere Runden).
    const sichten: Sicht[] = await this.d.sichtenVerwaltung.listeSichten();
    const tiefe = (sid: string): number => {
      const s = sichten.find((x) => x.id === sid);
      return s?.elternId ? 1 + tiefe(s.elternId) : 0;
    };
    for (const sid of Object.values(p.sichten)
      .filter((x) => sichten.some((s) => s.id === x))
      .sort((a, b) => tiefe(b) - tiefe(a)))
      await this.d.sichtenVerwaltung.loescheSicht(sid);
    let offen = [...typIds];
    for (let runde = 0; offen.length; runde++) {
      let typen = await this.d.mappentypen.listeTypen();
      offen = offen.filter((t) => typen.some((x) => x.id === t));
      const fehler: string[] = [];
      const vorher = offen.length;
      for (const t of offen) await this.d.mappentypen.loescheTyp(t).catch((x: Error) => fehler.push(meldungen(x)));
      const rest = new Set((await this.d.mappentypen.listeTypen()).map((x) => x.id));
      offen = offen.filter((t) => rest.has(t));
      if (!offen.length) break;
      if (runde > 0 && offen.length === vorher)
        throw new Fachfehler(409, t('meldungen.pakete.laesst-sich-nicht-ganz', { name: p.name }), { gruende: fehler });
      // Kein Fortschritt: Typen des Pakets verweisen im Kreis aufeinander – diese Verweise zuerst lösen.
      if (offen.length === vorher) {
        const bleibt = new Set(offen);
        // Tabellen (#1030) zuerst: Solange eine Tabelle Mappen eines Typs über ein Feld zeigt, darf das Feld nicht weg.
        if (await this.ohneTabellenAuf(typen, bleibt)) typen = await this.d.mappentypen.listeTypen();
        for (const t of typen.filter((x) => bleibt.has(x.id))) {
          const felder = ohneZiele(t, bleibt);
          if (felder.length === t.felder.length && felder.every((f, i) => f === t.felder[i])) continue;
          const register = t.register.map((r) =>
            r.quellen ? { ...r, quellen: r.quellen.filter((q) => !bleibt.has(q.typId) || q.typId === t.id) } : r,
          );
          await this.d.mappentypen.aendereTyp(t.id, { ...t, felder, register });
        }
      }
    }
    // Hinweise (#1034) gehen mit; berechnete Felder in Typen, die bleiben, behalten ihren letzten Wert.
    await Promise.all([
      this.d.kern.repo.loeschePaket(id),
      this.d.suche.setzePaketSynonyme(id, []),
      this.d.kern.repo.loescheHinweiseVon(id),
    ]);
    // Sprachpaket (#731): Texte weg, Sprache aus der Einstellung, alle Prozesse laden neu. Beschriftungen an Mappentypen
    // bleiben – wie andere Beschriftungen einer nicht erlaubten Sprache stören sie nicht und gelten bei einer Neuinstallation.
    if (p.sprache) {
      await this.d.kern.repo.loescheSprachpaket(id);
      await Promise.resolve(this.o.sprachen?.entfernt(p.sprache.kennung)).catch((e: Error) =>
        log.warn('Sprache nicht aus der Einstellung genommen', { paket: id, fehler: e.message }),
      );
    }
    // #712: mitgelieferte Automatisierungen, die aus und unverändert sind, gehen mit; geänderte bleiben (rot, wenn ihr Typ fehlt).
    await this.d
      .paketAutomatisierungen?.(p, [])
      .catch((e: Error) => log.warn('Automatisierungen des Pakets nicht entfernt', { paket: id, fehler: e.message }));
    // #1044: Vorlagen gehen mit; überlagerte Kern-Vorgaben gelten wieder, Vorlagen mit offenen Abläufen bleiben als eigene.
    await this.d.ablaeufe
      .ausPaket(p, [])
      .catch((e: Error) => log.warn('Automatisierungsvorlagen des Pakets nicht entfernt', { paket: id, fehler: e.message }));
    if (p.laeufer) {
      await this.d.kern.repo.loeschePaketCode(id);
      await this.d.kern.repo.loescheEreignisse(id);
      await this.d.kern.repo.loescheVerlauf(id);
      await setzePaketSpeicher(this.d.kern, id, null).catch(() => {});
      await this.o.laeufer?.codeGeaendert?.();
    }
    // Volltext und Umwandeln (Frage 51): Was noch auf dieses Paket wartete, wartet nicht mehr.
    const wartetAuf = [
      ...(hatSchnittstelle(p.laeufer, 'dms:volltext') ? (p.laeufer?.volltext ?? []) : []),
      ...(hatSchnittstelle(p.laeufer, 'dms:umwandeln') ? (p.laeufer?.umwandeln ?? []) : []),
    ];
    if (wartetAuf.length)
      await this.d.volltextAusPaketen
        .paketWegFuerDateien(p, wartetAuf)
        .catch((e: Error) => log.warn('Wartende Dokumente nach dem Entfernen nicht zurückgesetzt', { paket: id, fehler: e.message }));
    // Einstellungen (#197): nur auf ausdrücklichen Wunsch für eine spätere Neuinstallation behalten.
    if (!behalten) await this.d.kern.fassungen.geloescht('paketeinstellungen', id, () => setzePaketEinstellungen(this.d.kern, id, null));
    log.info('Paket entfernt', {
      von: von.email,
      paket: id,
      version: p.version,
      einstellungenBehalten: behalten,
      beispieleEntfernt: bsp.unveraendert.length,
      vorgabenEntfernt: vorgabenWeg.length,
    });
    void nachweis('betrieb.paket', { aktion: 'entfernt', paket: id, version: p.version, vorher: null, von: von.email });
    // Vorgaben, die bleiben, behalten ihre feste Kennung: Eine neue Installation nimmt sie wieder auf, statt sie doppelt anzulegen.
    const vorgabenBehalten = [
      ...vg.fremdBenutzt.map((m) => ({ id: m.id, titel: m.titel || m.id })),
      ...(vorgabenWahl === 'entfernen' ? [] : vg.frage.map(({ id: x, titel }) => ({ id: x, titel }))),
    ];
    return { beispieleBehalten: bsp.geaendert.filter((g) => !eigeneTypen.has(g.typId)).map(({ typId: _t, ...g }) => g), vorgabenBehalten };
  }
}
