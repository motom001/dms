/**
 * Ereignisse (#670, #1078 aus dienst.ts): Aufgaben als „etwas ist zu erledigen“ melden, neue Verknüpfungen melden, jedes
 * Ereignis des Katalogs an die Pakete, die es abonniert haben (#686 nur mit Leserecht, #796 KI-Sperre), Aufträge an genau
 * ein Paket und die Nachberechnung der Vektoren (#442). Schicht 2 – bekommt den Kern, die Rechteprüfung und die Pakete
 * am Mappentyp samt KI-Freigabe; Ereignis auslösen, den Wecker des Paket-Läufers und den Stand der Texterkennung
 * (volltext/, Schicht 3) über den Anschluss.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Kern } from '../kern';
import type { TypPakete } from '../mappentypen';
import type { KiTypen } from '../mappentypen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { EREIGNISKATALOG, type Katalogeintrag, type KatalogEreignis, VERALTETE_EREIGNISSE } from '../../../shared/src/ereignisse';
import { type Aufgabe, type Mappentyp, verweiseVon, type Werte } from '../../../shared/src/model';
import { type EreignisArt, hatSchnittstelle, type InstalliertesPaket, istKiPaket, kenntVolltextOhneText } from '../../../shared/src/pakete';

/** Die Teile, die die Ereignisse rufen: Rechteprüfung, Pakete am Mappentyp und die KI-Freigabe der Mappentypen. */
export interface EreignisseTeile { rechte: ZugriffDienst; typpakete: TypPakete; ki: KiTypen }

/** Was die Ereignisse außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface EreignisseAnschluss {
  /** Ereignis auslösen – über die Fassade des Dienstes (Tests ersetzen `dienst.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Wecker des Paket-Läufers (Feld am Dienst, vom Start gesetzt). */
  ereignisWecker(): (() => void) | null;
  /** Stand der Texterkennung nachtragen (#796; volltext/, Schicht 3, über die Fassade). */
  nachTexterkennungsEreignis(paket: string, e: { art: string; daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }): Promise<void>;
}

export class EreignisseDienst {
  constructor(private readonly kern: Kern, private readonly teile: EreignisseTeile, private readonly anschluss: EreignisseAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ereignisWecker() { return this.anschluss.ereignisWecker(); }
  private danach(f: () => void) { this.kern.danach(f); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private typVon(mappeId: string): Promise<string | null> { return this.kern.typVon(mappeId); }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) { return this.teile.rechte.typverweise(...a); }
  private paketSiehtNicht(...a: Parameters<TypPakete['paketSiehtNicht']>) { return this.teile.typpakete.paketSiehtNicht(...a); }
  private kiSperre(...a: Parameters<KiTypen['kiSperre']>) { return this.teile.ki.kiSperre(...a); }
  private kiSperreFuer(paketId: string) { return this.teile.ki.kiSperreFuer(paketId); }
  private nachTexterkennungsEreignis(...a: Parameters<EreignisseAnschluss['nachTexterkennungsEreignis']>) { return this.anschluss.nachTexterkennungsEreignis(...a); }

  /**
   * Nachberechnung des Bestands (#442): für bis zu `max` Dokumente mit Volltext ohne Vektor dieses Modells ein
   * Ereignis „volltext.fertig“ an das Paket (nach = Dokument-Id, ab der weitergesucht wird). Liefert die Ids.
   */
  async vektorNachlauf(paket: string, modell: string, max: number, nach: string | null): Promise<string[]> {
    const alle = await this.kern.repoOhneTransaktion.ohneVektor(modell, max, nach);
    if (!alle.length) return [];
    // KI-Dienste (#796): Dokumente nicht zugelassener Mappentypen bekommt ein KI-Paket auch hier nicht (Stelle rückt trotzdem weiter).
    const gesperrt = await this.kiSperreFuer(paket);
    const typen = await this.kern.repoOhneTransaktion.typenVon([...new Set(alle.map((d) => d.mappeId))]);
    const liste = alle.filter((d) => { const typ = typen.get(d.mappeId); return !!typ && !gesperrt(typ); });
    if (liste.length) await this.kern.repoOhneTransaktion.legeEreignisseAn(liste.map((d) => ({ id: randomUUID(), paketId: paket, art: 'volltext.fertig', daten: { dokument: d.id, mappe: d.mappeId, nachberechnung: true } })));
    this.ereignisWecker?.();
    return alle.map((d) => d.id);
  }

  /** Aufgabe anlegen und als „etwas ist zu erledigen“ melden (#670). */
  async neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe> {
    const x = await this.repo.legeAufgabeAn(a);
    await this.ereignis('aufgabe.neu', { aufgabe: x.id, mappe: x.mappeId, typ: typ ?? await this.typVon(x.mappeId), empfaenger: x.empfaengerId ?? null, aufgabenart: x.art }, a.erstelltVon ?? null);
    return x;
  }

  /** Neue Verweise auf andere Mappen (#670: „zu dieser Mappe hin verknüpft“) – je neu verknüpfter Mappe ein Ereignis. */
  async meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    const vorher = new Set(verweiseVon(typ, alt).map((v) => `${v.feldKey}|${v.zielId}`));
    const ziele = verweiseVon(typ, neu).filter((v) => !vorher.has(`${v.feldKey}|${v.zielId}`) && v.zielId !== mappeId);
    if (!ziele.length) return;
    const typen = await this.repo.typenVon([...new Set(ziele.map((v) => v.zielId))]);
    for (const v of ziele) await this.ereignis('mappe.verknuepft', { mappe: v.zielId, typ: typen.get(v.zielId) ?? null, von: mappeId, vonTyp: typ.id, feld: v.feldKey }, von);
  }

  /**
   * Abnehmer „pakete“ (#670, #724): jedes Ereignis des Katalogs an die Pakete, die es abonniert haben – derselbe
   * Ausgangskorb wie für Automatisierungen und Webhooks, die Zustellung samt Wiederholung macht der Paket-Läufer.
   * - Ein Paket bekommt seine eigenen Änderungen nicht gemeldet (sonst Schleifen).
   * - Mappen-Ereignisse nur zu Typen unter `code.mappentypen` (eigene, fremde, „*“) und nur, wenn der Paket-Benutzer
   *   die Mappe gerade lesen darf (#686; sonst still nicht, Grund im Protokoll); Ereignisse aus Demo-Daten und Beispielen nur, wenn
   *   sie Dateien betreffen (Texterkennung, Vektoren), nie Mappen-Ereignisse.
   * - `volltext.fertig` ohne Text nur an Pakete, die das kennen; `sicherung.fertig` nur mit `dms:sicherung-lesen`.
   * - Veraltete Namen (Übergang): wer `texterkennung.fertig` abonniert hat, bekommt den Volltext der eingebauten
   *   Texterkennung unter diesem Namen.
   * Die Id je Paket ist fest (aus Ereignis, Paket und Name) – kommt das Ereignis noch einmal, entsteht nichts doppelt.
   */
  async ereignisAnPakete(e: KatalogEreignis) {
    const k = EREIGNISKATALOG[e.art] as Katalogeintrag;
    if (!k.paket || k.gruppe === 'auftrag') return;
    if (e.ausloeser.still && k.mappentyp) return;
    const alt = Object.entries(VERALTETE_EREIGNISSE).filter(([, neu]) => neu === e.art).map(([name]) => name as EreignisArt);
    const zustellungen: Array<{ paket: InstalliertesPaket; art: EreignisArt }> = [];
    const pakete = await this.kern.repoOhneTransaktion.listePakete();
    const typen = k.mappentyp ? await this.kern.repoOhneTransaktion.listeTypen() : [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || (e.ausloeser.art === 'paket' && e.ausloeser.id === p.id)) continue;
      if (e.art === 'sicherung.fertig' && !hatSchnittstelle(l, 'dms:sicherung-lesen')) continue;
      if (k.mappentyp) {
        const abonniert = l.ereignisse.includes(e.art as EreignisArt);
        if (!abonniert || typeof e.daten.typ !== 'string' || !(await this.typverweise(p.id, pakete, typen))(l.mappentypen ?? []).has(e.daten.typ)) continue;
        // #686: nur, was der Paket-Benutzer gerade lesen darf (bestätigte Rechte, „Pakete“ am Mappentyp, Regeln für die Rolle „Paket“).
        const grund = await this.paketSiehtNicht(p, e.daten.typ, typeof e.daten.mappe === 'string' ? e.daten.mappe : null);
        if (grund) { protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe: e.daten.mappe ?? null, grund }); continue; }
      }
      // KI-Dienste (#796): Ereignisse zu Dokumenten und Mappen eines nicht zugelassenen Mappentyps bekommt ein KI-Paket
      // nicht – auch nicht Dateiname oder Ids. Lässt sich der Typ nicht bestimmen, gilt er als gesperrt (nie falsch).
      if (!k.mappentyp && istKiPaket(l) && (l.ereignisse.includes(e.art as EreignisArt) || alt.some((a) => l.ereignisse.includes(a)))) {
        const mappe = typeof e.daten.mappe === 'string' ? e.daten.mappe : null;
        const typ = typeof e.daten.typ === 'string' ? e.daten.typ : mappe ? (await this.kern.repoOhneTransaktion.holeMappe(mappe))?.typId ?? null : null;
        if ((typ && (await this.kiSperre(p))(typ)) || (!typ && (mappe || typeof e.daten.dokument === 'string'))) {
          protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          await this.kiUebersprungen(p.id, e.art, e.daten);
          continue;
        }
      }
      const ohneText = e.art === 'volltext.fertig' && e.daten.text === false && !kenntVolltextOhneText(p);
      if (l.ereignisse.includes(e.art as EreignisArt) && !ohneText) zustellungen.push({ paket: p, art: e.art as EreignisArt });
      for (const a of alt) if (l.ereignisse.includes(a) && e.daten.quelle === 'kern') zustellungen.push({ paket: p, art: a });
    }
    if (!zustellungen.length) return;
    const daten: Record<string, unknown> = { ...e.daten, ereignis: e.id };
    // Name der Datei nur für Pakete (nicht im Ausgangskorb, der nur Ids kennt).
    if (e.art === 'dokument.hochgeladen' && typeof e.daten.dokument === 'string') daten.name = (await this.kern.repoOhneTransaktion.holeDokument(e.daten.dokument))?.name ?? null;
    const fuer = (art: EreignisArt): Record<string, unknown> => (art === 'texterkennung.fertig' ? { ...daten, seiten: daten.seiten ?? null } : daten);
    const feste = (paket: string, art: string) => { const h = createHash('sha256').update(`${e.id}|${paket}${art === e.art ? '' : `|${art}`}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
    await this.kern.repoOhneTransaktion.legeEreignisseAn(zustellungen.map((z) => ({ id: feste(z.paket.id, z.art), paketId: z.paket.id, art: z.art, daten: fuer(z.art) })));
    this.ereignisWecker?.();
  }

  /**
   * Ein Ereignis ging wegen der KI-Sperre nicht an das Paket (#796): Wartet das Dokument auf die Texterkennung dieses
   * Pakets (`volltext.fertig`), wartet es nicht weiter. Aufträge (`datei.*`) behandelt der Aufrufer von `auftrag`.
   */
  private async kiUebersprungen(paket: string, art: string, daten: Record<string, unknown>) {
    const grund = t('meldungen.dienst.ki-nicht-zugelassen');
    try {
      if (art === 'volltext.fertig') await this.nachTexterkennungsEreignis(paket, { art, daten }, { ok: true, text: grund });
    } catch (x) {
      protokoll.modul('werkbank').warn('Stand nach KI-Sperre nicht nachgetragen', { paket, art, fehler: (x as Error).message });
    }
  }

  /**
   * Auftrag an genau ein Paket (#577, #614, #631, #338): Der Kern bittet ein bestimmtes Paket um etwas (Datei umwandeln,
   * Volltext, Archivfassung) bzw. sagt ihm, dass seine Einstellungen geändert sind. Kein Geschehen für andere – daher
   * nicht im Ausgangskorb, sondern direkt in der Zustellung des Paket-Läufers (gleiche Wiederholung). In einer
   * Transaktion gehört er zur Änderung; sonst landen Fehler nur im Protokoll.
   */
  async auftrag(paket: string, art: Extract<EreignisArt, 'datei.umwandeln' | 'datei.volltext' | 'datei.archivfassung' | 'paket.einstellungen_geaendert'>, daten: Record<string, unknown>): Promise<'gesperrt' | void> {
    const inTx = this.kern.inEigenerTransaktion();
    try {
      const p = (await this.repo.listePakete()).find((x) => x.id === paket && x.laeufer?.ereignisse.includes(art));
      if (!p) return;
      // KI-Dienste (#796): Dateien eines nicht zugelassenen Mappentyps gehen an kein KI-Paket. „gesperrt“: Der Aufrufer
      // setzt den Stand selbst (bzw. stellt den Auftrag über ein anderes Dokument mit derselben Datei).
      if (istKiPaket(p.laeufer) && (typeof daten.mappe === 'string' || typeof daten.dokument === 'string')) {
        const typ = typeof daten.mappe === 'string' ? (await this.repo.holeMappe(daten.mappe))?.typId ?? null : null;
        if (!typ || (await this.kiSperre(p))(typ)) {
          protokoll.modul('werkbank').info('Auftrag nicht an Paket gegeben', { paket: p.id, art, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          return 'gesperrt';
        }
      }
      await this.repo.legeEreignisseAn([{ id: randomUUID(), paketId: p.id, art, daten }]);
      this.danach(() => this.ereignisWecker?.());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('werkbank').error('Auftrag an Paket nicht gespeichert', { art, paket, fehler: (e as Error).message });
    }
  }
}
