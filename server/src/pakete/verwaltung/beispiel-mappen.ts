/**
 * Beispiel-Mappen und -Dokumente (#347, #878) anlegen und entfernen.
 */
import { type InstalliertesPaket } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { istVorgabeWert, vorgabeVerweis } from '../../../../shared/src/vorgaben';
import { beispielDateiart, beispielName, beispielWerte, eigeneVerweise, istBeispielVerweis, ordneBeispiele } from './beispiele';
import { type Paket, type PaketBeispiel } from './format';
import { meldungen } from './hilfen';
import { type Handelnder, log } from './optionen';
import { PaketHochladen } from './hochladen';

/** Beispiel-Mappen. */
export abstract class PaketBeispiele extends PaketHochladen {
  /**
   * Beispiel-Mappen eines Pakets anlegen (#347, #878): Verweise zwischen Beispielen zuerst die Ziele, fremde Beispiele aus
   * dem Eintrag der Abhängigkeit, Vorgaben über ihre Kennung; Dokumente wie beim Hochladen. Ohne Mappen-Ereignisse
   * (Frage 71) – also keine Automatisierungen und Benachrichtigungen. Beim Installieren und nachträglich für die
   * Beispiel-Ablage (#988); `mappen` sammelt die angelegten zum Zurückrollen.
   */
  protected async legeBeispielMappen({
    paket,
    ziel,
    vorgabeId,
    installierte,
    von,
    mappen,
    beispielIds,
  }: {
    paket: Paket;
    ziel: (vw: string) => string;
    vorgabeId: (vw: string) => string | null;
    installierte: InstalliertesPaket[];
    von: Handelnder;
    mappen: string[];
    beispielIds: Map<string, string>;
  }): Promise<void> {
    const m = paket.manifest;
    // Verweise zwischen Beispielen (#347): erst die Ziele anlegen; fremde Beispiele aus dem Eintrag der Abhängigkeit.
    const reihenfolge = ordneBeispiele(paket.beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, m.id) }))) ?? paket.beispiele;
    const ohneZiel = new Set<string>();
    const aufloesen = async (w: unknown): Promise<string | undefined> => {
      // Verweis auf eine Vorgabe (#1038): eigene über die Lage, fremde über die feste Kennung.
      if (istVorgabeWert(w)) {
        const id =
          vorgabeId(w.vorgabe) ??
          (vorgabeVerweis(w.vorgabe, m.id).paket !== m.id ? (await this.vorgabeMappe(w.vorgabe, m.id))?.id : undefined);
        if (!id) ohneZiel.add(w.vorgabe);
        return id ?? undefined;
      }
      if (!istBeispielVerweis(w)) return undefined;
      const [p, s] = w.beispiel.includes(':') ? w.beispiel.split(':') : [m.id, w.beispiel];
      const zielId = p === m.id ? beispielIds.get(s) : installierte.find((x) => x.id === p)?.beispiele?.[s];
      if (zielId && (p === m.id || (await this.d.eingangskanaele.gibtMappe(zielId)))) return zielId;
      ohneZiel.add(w.beispiel);
      return undefined;
    };
    for (const b of reihenfolge) {
      const typId = ziel(b.typ);
      const felder = (await this.d.mappentypen.listeTypen()).find((t) => t.id === typId)?.felder ?? [];
      const werte = await beispielWerte(b.werte, felder, aufloesen);
      let mappeId: string;
      try {
        mappeId = (await this.d.kern.ohneEreignisse(() => this.d.mappen.legeMappeAn({ typId, werte }, von.id))).id;
      } catch (f) {
        throw new Fachfehler(422, t('meldungen.pakete.beispiel', { meldungen: meldungen(f) }));
      }
      mappen.push(mappeId);
      if (b.schluessel) beispielIds.set(b.schluessel, mappeId);
      await this.legeBeispielDokumente(paket, b, typId, mappeId, von);
    }
    if (ohneZiel.size) log.info('Paket: Verweise in Beispielen ohne Ziel bleiben leer', { paket: m.id, ziele: [...ohneZiel] });
  }

  /**
   * Beispiel-Dokumente (#878): wie beim Hochladen (Größe, Art, Vorschau, Volltext, Archivfassung), ohne Mappen-Ereignisse
   * (Frage 71) – Pakete, die Dateien verarbeiten, bekommen sie trotzdem.
   */
  private async legeBeispielDokumente(paket: Paket, b: PaketBeispiel, typId: string, mappeId: string, von: Handelnder): Promise<void> {
    if (!b.dokumente?.length) return;
    const register =
      (await this.d.mappentypen.listeTypen()).find((t) => t.id === typId)?.register.filter((r) => r.art === 'dokumente') ?? [];
    for (const dok of b.dokumente) {
      const reg = dok.register ? register.find((r) => r.key === dok.register) : register[0];
      const inhalt = paket.beispielDateien?.get(dok.datei);
      if (!reg || !inhalt)
        throw new Fachfehler(
          422,
          t('meldungen.pakete.beispiel', {
            meldungen: t('meldungen.pakete.beispiel-dokument-ohne-register', {
              wert: paket.beispiele.indexOf(b) + 1,
              datei: dok.datei,
              register: dok.register ?? '–',
            }),
          }),
        );
      const name = beispielName(dok);
      try {
        await this.d.kern.ohneEreignisse(() =>
          this.d.dokumente.ladeHoch(
            mappeId,
            {
              register: reg.key,
              name,
              typ: beispielDateiart(dok.datei, inhalt) ?? undefined,
              herkunft: 'paket',
              ...(dok.datum ? { erstellt: `${dok.datum}T12:00:00.000Z` } : {}),
            },
            inhalt,
            von.id,
          ),
        );
      } catch (f) {
        throw new Fachfehler(422, t('meldungen.pakete.beispiel', { meldungen: `${name}: ${meldungen(f)}` }));
      }
    }
  }

  /**
   * Entfernen: nur ohne Mappen der Typen des Pakets und wenn kein anderes Paket davon abhängt. Ein Sprachpaket (#731)
   * nutzt vielleicht jemand: dann nur mit `spracheBestaetigt` – die Betroffenen sehen danach die Sprache der
   * Installation (Deutsch, wenn es deren Sprache war), ihre Wahl bleibt gespeichert und Mein Konto sagt es ihnen.
   */
  /**
   * „Beispiele entfernen“ (#878): unveränderte Beispiel-Mappen des Pakets samt Dokumenten endgültig weg; geänderte (oder
   * solche, auf die andere Mappen verweisen) bleiben als normale Mappen und werden genannt. Danach merkt sich das Paket
   * keine Beispiele mehr.
   */
  async beispieleEntfernen(
    id: string,
    von: Handelnder,
  ): Promise<{ entfernt: number; behalten: Array<{ id: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    const b = await this.d.beispielMappen.pruefeBeispiele(p.beispielMappen ?? []);
    if (b.unveraendert.length) await this.d.beispielMappen.entferneBeispielMappen(b.unveraendert, von.id);
    const weg = new Set(b.unveraendert);
    const { beispielMappen: _bm, beispiele: alteSchluessel, ...rest } = p;
    const schluessel = Object.fromEntries(Object.entries(alteSchluessel ?? {}).filter(([, mid]) => !weg.has(mid)));
    await this.d.kern.repo.speicherePaket({ ...rest, ...(Object.keys(schluessel).length ? { beispiele: schluessel } : {}) });
    log.info('Beispiele eines Pakets entfernt', {
      von: von.email,
      paket: id,
      entfernt: b.unveraendert.length,
      behalten: b.geaendert.length,
    });
    return { entfernt: b.unveraendert.length, behalten: b.geaendert.map(({ typId: _t, ...g }) => g) };
  }

  /**
   * Beispiele eines installierten Pakets nachträglich anlegen (#988, Beispiel-Ablage): dieselbe Version aus dem Katalog,
   * dieselben Regeln wie beim Installieren. Sind schon Beispiele da, passiert nichts; scheitert etwas, kommen die eben
   * angelegten wieder weg. Hochgeladene Pakete lassen sich nicht erneut holen.
   */
  async beispieleAnlegen(id: string, von: Handelnder): Promise<{ angelegt: number }> {
    const installierte = await this.d.kern.repo.listePakete();
    const p = installierte.find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (p.beispielMappen?.length) return { angelegt: 0 };
    if (p.herkunft.art !== 'katalog') throw new Fachfehler(409, t('meldungen.pakete.beispiele-nur-katalog', { name: p.name }));
    const { paket } = await this.lade(p.id, p.version, p.herkunft.url);
    if (!paket.beispiele.length) return { angelegt: 0 };
    const typen = new Set((await this.d.mappentypen.listeTypen()).map((x) => x.id));
    const dmsTypen = await this.dmsTypen();
    const ziel = (vw: string): string => {
      const [pk, s] = vw.includes(':') ? vw.split(':') : [p.id, vw];
      const tid = pk === 'dms' ? dmsTypen.get(s)?.id : installierte.find((x) => x.id === pk)?.typen[s];
      if (!tid || !typen.has(tid)) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich-2', { vw, p: pk, s }));
      return tid;
    };
    // Vorgaben (#1038) über ihre feste Kennung – eigene wie fremde.
    const vorgaben = new Map<string, string | null>();
    for (const w of paket.beispiele.flatMap((b) => Object.values(b.werte).flatMap((x) => (Array.isArray(x) ? x : [x])))) {
      if (istVorgabeWert(w) && !vorgaben.has(w.vorgabe)) vorgaben.set(w.vorgabe, (await this.vorgabeMappe(w.vorgabe, p.id))?.id ?? null);
    }
    const mappen: string[] = [];
    const beispielIds = new Map<string, string>();
    try {
      await this.legeBeispielMappen({ paket, ziel, vorgabeId: (vw) => vorgaben.get(vw) ?? null, installierte, von, mappen, beispielIds });
    } catch (e) {
      await this.d.loeschen.entferneMappenEndgueltig(mappen).catch(() => {});
      throw e;
    }
    const beispielMappen = await this.d.beispielMappen.beispielStand(mappen);
    await this.d.kern.repo.speicherePaket({
      ...p,
      ...(beispielIds.size ? { beispiele: Object.fromEntries(beispielIds) } : {}),
      beispielMappen,
    });
    log.info('Beispiele eines Pakets angelegt', { von: von.email, paket: id, angelegt: mappen.length });
    return { angelegt: mappen.length };
  }
}
