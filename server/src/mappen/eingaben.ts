/**
 * Eingaben an Mappen prüfen (#1074 aus dienst.ts): Werte bereinigen und prüfen, Formate (#535), Auswahlfilter (#172,
 * #173), „folgt aus“ (#886), Verweisziele, Rechte vor und nach dem Speichern (#126), Konflikte beim gleichzeitigen
 * Bearbeiten (#609), „beim Auswählen übernehmen“ (#1037). Die Eingabe-Hilfen der Mappentypen liegen in mappentypen/eingabe.ts. Schicht 2.
 */
import { vonAussenFuellbar } from '../../../shared/src/berechnet';
import { ausgeblendeteFelder } from '../../../shared/src/darstellung';
import { anzeigestand, hatAnzeige, hatEigeneOrganisationBedingung, pruefeMitAnzeige } from '../../../shared/src/anzeige';
import { leseProzent, leseZeitraum } from '../../../shared/src/feldarten';
import { wertfelder } from '../../../shared/src/tabelle';
import { gleicheFormateAn, hatVorgaben, pruefeFormate, unpassendeAngaben } from '../../../shared/src/feldformate';
import { enthaeltId, ersteId, folgeReihenfolge } from '../../../shared/src/folgtaus';
import { passtZusammen } from '../../../shared/src/vorbelegen';
import { setzeZusammengesetzte } from '../../../shared/src/zusammengesetzt';
import type { Vorschlaege } from '../../../shared/src/erkennung';
import { einzigesZiel, type Feld, pruefeMappe, zielErlaubt, type Feldkonflikt, formatiere, gemeinsameFelder, type Historieneintrag, istLeer, istOk, type Mappe, type MappenBezug, type Mappentyp, verweiseVon, type Verweiskonflikt, type Wert, type Werte, zieleVon, zielTypenAus } from '../../../shared/src/model';
import type { Rechte } from '../../../shared/src/rechte';
import { type Aufloesung, auswahlKlausel, auswahlProbleme, bereinigeAuswahlfilter, erfuellt, heuteIn, setzeEigeneWerte } from '../../../shared/src/sichten';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { keinSchluessel, passwortWert } from './passwortfelder';

/** Auswahlfilter (#172) zählen nichts – nur Bedingungen auf Felder. */

const KEINE_ZAEHLUNG = { dokumente: () => 0, verknuepfungen: () => 0 };

/** Nur Werte zu bekannten Feldern; leere Eingaben werden zu null. */
export function bereinigeWerte(typ: Mappentyp, eingabe: unknown, bisher: Werte = {}, verschluessele: (k: string) => string = keinSchluessel): Werte {
  const roh = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  // Tabellen (#1030) haben keinen Wert: Was unter ihrer Kennung gesendet wird, fällt weg; Gespeichertes (ein früheres
  // Feld gleicher Kennung) bleibt wie bei entfernten Feldern.
  const bekannt = new Set(wertfelder(typ.felder).map((f) => f.key));
  const werte: Werte = {};
  // Werte aus entfernten Feldern bleiben erhalten.
  for (const [k, v] of Object.entries(bisher)) if (!bekannt.has(k)) werte[k] = v;
  for (const f of wertfelder(typ.felder)) {
    if (f.typ === 'passwort') { werte[f.key] = passwortWert(roh[f.key], f.key in roh, bisher[f.key], verschluessele); continue; }
    const v = f.key in roh ? roh[f.key] : bisher[f.key];
    werte[f.key] = istLeer(v) ? (f.typ === 'janein' ? false : null) : gleicheArtAn(f, v as Werte[string]);
  }
  // Feldformate (#535): geänderte Eingaben angleichen (https:// ergänzen, IBAN in Vierergruppen).
  const angeglichen = gleicheFormateAn(typ, werte, bisher);
  // Zusammengesetzt (#1050): schreibgeschützt – was die Anfrage dafür schickt, zählt nicht; Ablago setzt es aus den Teilen.
  setzeZusammengesetzte(typ, angeglichen);
  return angeglichen;
}

/**
 * Zeitraum und Prozent (#1035) in die gespeicherte Form bringen: „3 Monate“, „P3M“ oder `{ anzahl: "3", … }` →
 * `{ anzahl: 3, einheit: 'monate' }`; „19 %“ oder „19,0“ → 19. Was sich nicht lesen lässt, bleibt – die Prüfung meldet es.
 */
function gleicheArtAn(f: Feld, v: Wert): Wert {
  if (f.typ === 'zeitraum') return leseZeitraum(v) ?? v;
  if (f.typ === 'prozent' && typeof v === 'string') { const n = leseProzent(v); return n != null && Number.isFinite(n) ? n : v; }
  return v;
}

/** Felder, die eine Anfrage selbst setzt – auch leer. „Folgt aus“ (#886) füllt sie nicht. */
export const gesendeteFelder = (w: unknown) => new Set(w && typeof w === 'object' && !Array.isArray(w) ? Object.keys(w) : []);

/** Was die Eingaben außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht. */
export interface MappenEingabenAnschluss {
  /** Passwortfelder verschlüsseln (#46; Schlüssel aus tresor.ts, ohne Schlüssel ein Fehler). */
  verschluessele(klartext: string): string;
}

export class MappenEingaben {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst, private readonly anschluss: MappenEingabenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private readonly verschluessele = (klartext: string) => this.anschluss.verschluessele(klartext);
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.rechtepruefung.lesbare(...a); }
  private rechteAn(...a: Parameters<ZugriffDienst['rechteAn']>) { return this.rechtepruefung.rechteAn(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.rechtepruefung.pruefeRecht(...a); }
  private aufloesung(...a: Parameters<ZugriffDienst['aufloesung']>) { return this.rechtepruefung.aufloesung(...a); }

  /** „zeigt auf eine eigene Organisation“ (#995): nur nachschlagen, wenn der Typ so eine Bedingung hat. */
  private async eigeneOrganisation(typ: Mappentyp): Promise<((id: string) => boolean) | undefined> {
    if (!hatEigeneOrganisationBedingung(typ)) return undefined;
    const ids = new Set((await this.kern.eigeneOrganisationen()).map((x) => x.id));
    return (id) => ids.has(id);
  }

  /**
   * Werte vor dem Speichern prüfen. „Bereits vergeben“ (#743): alle eindeutigen Felder in einer Abfrage über den Index;
   * liegt der gleiche Wert in einer Mappe, die der Benutzer nicht lesen darf, nennt die Meldung ihren Titel nicht.
   */
  async pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string, alt?: Werte, z?: Zugriff) {
    const ids = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter(istUuid);
    const typen = await this.repo.typenVon(ids);
    const doppelt = new Map<string, string>();
    // Zusammengesetzt (#1050): die Kombination über ihren gespeicherten Schlüssel (Verweise als Kennung) – derselbe Index.
    const eindeutig = typ.felder.filter((f) => f.eindeutig && !istLeer(werte[f.key]) && (f.typ === 'text' || f.typ === 'zahl' || f.typ === 'zusammengesetzt'));
    if (eindeutig.length) {
      const funde = await this.repo.findeDoppelte(typ.id, eindeutig.map((f) => ({ mappeId: eigeneId ?? null, feldKey: f.key, wert: String(werte[f.key]) })));
      const lesbar = await this.lesbare(z, [...new Set([...funde.values()].map((d) => d.id))]);
      for (const f of eindeutig) {
        const d = funde.get(`${eigeneId ?? ''}|${f.key}`);
        if (d) doppelt.set(f.key, lesbar.has(d.id) ? d.titel || 'Ohne Titel' : '');
      }
    }
    // Anzeige-Bedingungen (#1033): dieselbe Auswertung wie im Formular (shared/src/anzeige.ts) – Felder, die bei
    // diesen Werten nicht zu sehen sind, sind nicht Pflicht.
    const merkmale = await this.kern.merkmale();
    const typVon = (id: string) => typen.get(id);
    const eigeneOrganisation = await this.eigeneOrganisation(typ);
    const p = pruefeMitAnzeige(typ, werte, { typVon, doppelt: (k) => doppelt.get(k), merkmale, eigeneOrganisation });
    // Formate und Datumsgrenzen (#535): beim Bearbeiten nur, was sich ändert – der Bestand bleibt gültig.
    for (const [k, m] of Object.entries(pruefeFormate(typ, werte, alt))) p.felder[k] ??= m;
    // Ausgeblendete Felder (#655, #1033): Was dort unverändert steht, hält das Speichern nicht auf – sehen kann es hier keiner.
    if (alt) {
      const aus = ausgeblendeteFelder(typ);
      if (hatAnzeige(typ)) for (const k of anzeigestand(typ, werte, { merkmale, typVon, eigeneOrganisation }).verborgen) aus.add(k);
      for (const k of Object.keys(p.felder)) if (aus.has(k) && JSON.stringify(werte[k] ?? null) === JSON.stringify(alt[k] ?? null)) delete p.felder[k];
    }
    if (!istOk(p)) {
      const namen = Object.keys(p.felder).map((k) => typ.felder.find((f) => f.key === k)?.label ?? k);
      throw new Fachfehler(422, namen.length ? t('meldungen.dienst.bitte-die-markierten-felder', { namen: namen.join(', ') }) : t('meldungen.dienst.bitte-die-markierten-felder-2'), p);
    }
  }

  /**
   * Angaben, die nicht zum Format bzw. zu den Datumsgrenzen passen (#535) – je Mappentyp und Feld, für die
   * Werkbank (Wartungsoperationen). Gespeichert bleiben sie gültig; beim nächsten Ändern des Felds müssen sie passen.
   */
  async unpassendeFormate(): Promise<Array<{ typId: string; typ: string; felder: Array<{ key: string; label: string; anzahl: number; mappen: Array<{ id: string; titel: string; wert: string; grund: string }> }> }>> {
    const heute = heuteIn();
    const aus = [];
    for (const typ of await this.repo.listeTypen()) {
      if (!typ.felder.some(hatVorgaben)) continue;
      const funde = unpassendeAngaben(typ, await this.repo.listeMappen(typ.id), heute);
      if (!funde.length) continue;
      const titel = new Map((await this.repo.holeMappen([...new Set(funde.map((f) => f.mappeId))])).map((m) => [m.id, m.titel || t('meldungen.dienst.ohne-titel')] as const));
      const felder = typ.felder.flatMap((f) => {
        const je = funde.filter((x) => x.feldKey === f.key);
        return je.length ? [{ key: f.key, label: f.label, anzahl: je.length, mappen: je.slice(0, 200).map((x) => ({ id: x.mappeId, titel: titel.get(x.mappeId) ?? t('meldungen.dienst.ohne-titel'), wert: x.wert.slice(0, 120), grund: x.grund })) }] : [];
      });
      aus.push({ typId: typ.id, typ: typ.name, felder });
    }
    return aus;
  }

  /**
   * Auswahlfilter (#172): neue Verweise müssen den Filter des Felds erfüllen; bisherige bleiben
   * gültig, auch wenn sie inzwischen nicht mehr passen.
   */
  async pruefeAuswahlfilter(typ: Mappentyp, werte: Werte, alt: Werte, benutzerId: string | null) {
    const mitFilter = typ.felder.filter((f) => f.typ === 'referenz' && f.auswahlFilter?.length);
    if (!mitFilter.length) return;
    const ids = (w: unknown) => (Array.isArray(w) ? w : w ? [w] : []).map(String).filter(istUuid);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(benutzerId ?? '');
    const fehler: Record<string, string[]> = {};
    for (const f of mitFilter) {
      const vorher = new Set(ids(alt[f.key]));
      const neu = ids(werte[f.key]).filter((x) => !vorher.has(x));
      const ziele = zieltypenIn(f, typen);
      if (!neu.length || !ziele.length) continue;
      // Werte aus der eigenen Mappe (#173): die, die gespeichert werden sollen.
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter!, werte), ziele, a);
      const gewaehlt = await this.repo.holeMappen(neu);
      const quelle = await this.zaehlungMitTypen(gewaehlt, typen);
      const falsch = gewaehlt.filter((m) => !k.typen.includes(m.typId) || !erfuellt(m, k.filter, quelle));
      if (falsch.length) fehler[f.key] = [t('meldungen.dienst.passt-nicht-zur-auswahl', { map: falsch.map((m) => `„${m.titel || t('meldungen.dienst.ohne-titel')}“`).join(', ') })];
    }
    if (Object.keys(fehler).length) throw new Fachfehler(422, t('meldungen.dienst.bitte-die-markierten-felder-2'), { allgemein: [], felder: fehler });
  }

  /**
   * Verweise, die nicht (mehr) zu dieser Mappe passen – für den Hinweis am Feld und die Zeile über den Registern (#172,
   * #886, #887): je Verweisfeld die unpassenden Mappen (`unpassend`) und je Feld die eigenen Felder, mit denen es nicht
   * zusammenpasst (`konflikte`). Bestehende Werte bleiben gültig – das ist nur ein Hinweis.
   */
  async verweiskonflikte(typ: Mappentyp | undefined, werte: Werte, benutzerId: string, schon?: { typen: Mappentyp[]; a: Aufloesung }, z?: Zugriff): Promise<{ unpassend: Record<string, string[]>; konflikte: Verweiskonflikt[] }> {
    const felder = typ?.felder.filter((f) => f.typ === 'referenz' && (f.auswahlFilter?.length || typ.felder.some((x) => x.folgtAus?.feld === f.key))) ?? [];
    if (!typ || !felder.length) return { unpassend: {}, konflikte: [] };
    const typen = new Map((schon?.typen ?? await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = schon?.a ?? await this.aufloesung(benutzerId);
    const unpassend: Record<string, string[]> = {};
    const konflikte: Verweiskonflikt[] = [];
    for (const f of felder) {
      const ids = (Array.isArray(werte[f.key]) ? werte[f.key] as string[] : werte[f.key] ? [String(werte[f.key])] : []).filter(istUuid);
      if (!ids.length) continue;
      const gruende = await this.verweisGruende(typ, f, await this.repo.holeMappen(ids), werte, zieltypenIn(f, typen), a, z);
      const falsch = ids.filter((id) => gruende[id]);
      if (!falsch.length) continue;
      unpassend[f.key] = falsch;
      const eigene = [...new Set(falsch.flatMap((id) => gruende[id]))];
      konflikte.push({ feld: f.key, eigeneFelder: eigene, ...(falsch.some((id) => !gruende[id].length) ? { regel: true } : {}), ids: falsch });
    }
    return { unpassend, konflikte };
  }

  /**
   * Passen gewählte Mappen eines Verweisfelds zu den übrigen Werten dieser Mappe (#172, #173, #886, #887)? Je unpassender
   * Mappe die eigenen Felder, mit denen sie nicht zusammenpasst: Felder, aus denen der Auswahlfilter Werte nimmt, und
   * Felder, die aus diesem Feld folgen und etwas anderes enthalten. Eine leere Liste heißt: passt nur nicht zu den festen
   * Bedingungen des Auswahlfilters. Was folgt, zählt nur mit Mappen, die die Person lesen darf.
   */
  private async verweisGruende(typ: Mappentyp, f: Feld, mappen: Mappe[], werte: Werte, ziele: Mappentyp[], a: Aufloesung, z?: Zugriff): Promise<Record<string, string[]>> {
    const gruende: Record<string, string[]> = {};
    const dazu = (id: string, k?: string) => { const g = (gruende[id] ??= []); if (k && !g.includes(k)) g.push(k); };
    if (ziele.length && f.auswahlFilter?.length) {
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter, werte), ziele, a);
      const eigene = f.auswahlFilter.filter((b) => b.wert?.art === 'eigenesFeld');
      const quelle = await this.zaehlungMitTypen(mappen, new Map(ziele.map((x) => [x.id, x] as const)));
      for (const m of mappen) {
        if (k.typen.includes(m.typId) && erfuellt(m, k.filter, quelle)) continue;
        dazu(m.id);
        for (const b of eigene) {
          const kb = auswahlKlausel(setzeEigeneWerte([b], werte), ziele, a);
          if (!erfuellt(m, kb.filter, quelle)) dazu(m.id, (b.wert as { feld: string }).feld);
        }
      }
    }
    const folgen = typ.felder.filter((x) => x.typ === 'referenz' && x.folgtAus?.feld === f.key && !istLeer(werte[x.key]));
    if (folgen.length) {
      const lesbar = await this.lesbare(z, mappen.map((m) => m.id));
      for (const m of mappen) {
        if (!lesbar.has(m.id) || m.typId !== einzigesZiel(f)) continue;
        for (const x of folgen) {
          const soll = ersteId(m.werte[x.folgtAus!.zielFeld]);
          if (istUuid(soll) && !enthaeltId(werte[x.key], soll)) dazu(m.id, x.key);
        }
      }
    }
    return gruende;
  }

  /**
   * Für Auswahlfilter im Arbeitsspeicher: ohne Zählungen, aber mit den Typen der Mappen, auf die diese Mappen verweisen
   * (#1036, „zeigt auf Mappe vom Typ …“ an einem Feld des Zieltyps).
   */
  private async zaehlungMitTypen(mappen: Mappe[], typen: Map<string, Mappentyp>) {
    const ids = [...new Set(mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; }))].filter(istUuid);
    const typVon = ids.length ? await this.repo.typenVon(ids) : new Map<string, string>();
    return { ...KEINE_ZAEHLUNG, typVon: (id: string) => typVon.get(id) };
  }

  /** Auswahlfilter (#172, #173) und „folgt aus“ (#886) beim Ausfüllen: welche der gewählten Mappen passen nicht, und womit nicht? */
  async auswahlPruefen(e: unknown, benutzerId: string, z?: Zugriff) {
    const x = (e ?? {}) as { typId?: unknown; feldKey?: unknown; ids?: unknown; werte?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    const f = typ?.felder.find((y) => y.key === x.feldKey && y.typ === 'referenz');
    const ziele = f ? zieltypenIn(f, new Map((await this.repo.listeTypen()).map((y) => [y.id, y] as const))) : [];
    // Nur Mappen, die man lesen darf – sonst verriete die Antwort etwas über ihre Werte.
    const roh = (Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid).slice(0, 200);
    const lesbar = await this.lesbare(z, roh);
    const ids = roh.filter((id) => lesbar.has(id));
    const leer = { unpassend: [] as string[], gruende: {} as Record<string, string[]> };
    if (!typ || !f || !ziele.length || !ids.length || !(f.auswahlFilter?.length || typ.felder.some((y) => y.folgtAus?.feld === f.key))) return leer;
    const werte = x.werte && typeof x.werte === 'object' ? x.werte as Werte : {};
    const gruende = await this.verweisGruende(typ, f, await this.repo.holeMappen(ids), werte, ziele, await this.aufloesung(benutzerId), z);
    return { unpassend: ids.filter((id) => gruende[id]), gruende };
  }

  /**
   * Folgt aus (#886) beim Speichern: Ein leeres Verweisfeld mit „folgt aus“ füllt sich aus dem Ziel seiner Quelle – nur,
   * wenn die Quelle neu gesetzt oder geändert ist, die Anfrage das Feld nicht selbst setzt (auch nicht leer) und die
   * Person beide Mappen lesen darf. Was schon drinsteht, überschreibt das nie; hat das Ziel keinen Wert, bleibt alles.
   */
  async folgeFuellen(typ: Mappentyp, werte: Werte, alt: Werte, gesendet: Set<string>, z?: Zugriff): Promise<void> {
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      // Berechnete Felder (#1034) füllt nur ihr Paket.
      if (gesendet.has(f.key) || !istLeer(werte[f.key]) || !vonAussenFuellbar(f)) continue;
      const q = ersteId(werte[quelle.key]);
      if (!istUuid(q) || q === ersteId(alt[quelle.key])) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      if (m) werte[f.key] = f.mehrfach ? [m.id] : m.id;
    }
  }

  /** Was aus der Quelle folgt: die Mappe im Feld `zielFeld` der Mappe `q` – vom passenden Typ und für die Person lesbar. */
  private async folgeWert(quelle: Feld, zielFeld: string, f: Feld, q: string, z?: Zugriff): Promise<Mappe | null> {
    const m = await this.repo.holeMappe(q);
    if (!m || m.typId !== einzigesZiel(quelle)) return null;
    const id = ersteId(m.werte[zielFeld]);
    if (!istUuid(id)) return null;
    const ziel = await this.repo.holeMappe(id);
    if (!ziel || ziel.typId !== einzigesZiel(f)) return null;
    const lesbar = await this.lesbare(z, [q, id]);
    return lesbar.has(q) && lesbar.has(id) ? ziel : null;
  }

  /**
   * Folgt aus (#886) für die Oberfläche: Was folgt aus den Quellen in `werte`? Je Feld mit „folgt aus“, dessen Quelle
   * einen Wert hat, die Mappe (mit Titel) oder null (das Ziel hat keinen Wert oder ist nicht lesbar).
   */
  async folgen(e: unknown, z?: Zugriff) {
    const x = (e ?? {}) as { typId?: unknown; werte?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    if (!typ || (z && !z.admin && z.typen && !z.typen.has(typ.id))) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-mappentyp'));
    const werte = x.werte && typeof x.werte === 'object' ? x.werte as Werte : {};
    const felder: Record<string, { quelle: string; wert: string | null; titel?: string; typId?: string }> = {};
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      const q = ersteId(werte[quelle.key]);
      if (!istUuid(q)) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      felder[f.key] = m ? { quelle: quelle.key, wert: m.id, titel: m.titel ?? '', typId: m.typId } : { quelle: quelle.key, wert: null };
    }
    return { felder };
  }

  /**
   * Folgt aus (#886) beim Ausfüllen aus Dokumenten: Hat die Erkennung eine Quelle vorgeschlagen, kommt für das Feld, das
   * daraus folgt, ein Vorschlag dazu (wenn es selbst keinen hat) – mit derselben Sicherheit und „aus …“ als Fundstelle.
   */
  async folgeVorschlaege(typ: Mappentyp, v: { vorschlaege: Record<string, { wert: Wert; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string }>; bezuege: Record<string, MappenBezug>; neu: Record<string, unknown> }, z?: Zugriff): Promise<void> {
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      if (v.vorschlaege[f.key]) continue;
      const vq = v.vorschlaege[quelle.key];
      const q = ersteId(vq?.wert);
      if (!vq || !istUuid(q)) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      if (!m) continue;
      v.vorschlaege[f.key] = { wert: f.mehrfach ? [m.id] : m.id, sicherheit: vq.sicherheit, fundstelle: t('meldungen.dienst.folgt-aus', { feld: quelle.label || quelle.key }) };
      v.bezuege[m.id] = { titel: m.titel ?? '', typId: m.typId };
      delete v.neu[f.key];
    }
  }

  /**
   * Beim Auswählen übernehmen (#1037): Was schlägt die Mappe `id` im Verweisfeld `f` für diese Mappe vor? Je Paar der
   * Wert aus der verwiesenen Mappe – nur, wenn die Person sie lesen darf, das Quellfeld im Typ der Mappe passt, das
   * Zielfeld von außen füllbar ist (nicht berechnet, #1034), nie aus oder in Passwortfelder und nur gültige Werte. Verweise
   * darin nur auf Mappen, die die Person ebenfalls lesen darf. Leere Werte schlagen nichts vor; welche Felder leer sind,
   * entscheidet der Aufrufer (nie überschreiben).
   */
  private async vorbelegteWerte(typ: Mappentyp, f: Feld, id: string, z?: Zugriff): Promise<{ mappe: Mappe; werte: Record<string, Wert>; bezuege: Record<string, MappenBezug> } | null> {
    const q = f.typ === 'referenz' && f.vorbelegen?.length ? await this.lesbareQuelle(f, id, z) : null;
    if (!q) return null;
    const { mappe: m, typ: quellTyp } = q;
    const roh = quellwerte(typ, f, quellTyp, m.werte);
    // Verweise in den Werten: nur auf lesbare Mappen (sonst verriete der Vorschlag deren Titel).
    const ids = [...new Set(roh.filter((x) => x.nach.typ === 'referenz').flatMap((x) => idsIn(x.wert)))].filter(istUuid);
    const lesbar = await this.lesbare(z, ids);
    const typVon = ids.length ? await this.repo.typenVon(ids) : new Map<string, string>();
    const titel = ids.length ? await this.repo.titelVon(ids) : new Map<string, string>();
    const werte: Record<string, Wert> = {};
    const bezuege: Record<string, MappenBezug> = {};
    for (const { nach, wert } of roh) {
      const w = nach.typ === 'referenz' ? nurLesbare(nach, wert, lesbar) : wert;
      // Gültig für das Zielfeld (Länge, Muster, Grenzen, Auswahl, Verweisziel); „eindeutig“ prüft erst das Speichern.
      if (w === null || !istOk(pruefeMappe({ felder: [nach] }, { [nach.key]: w }, { typVon: (x) => typVon.get(x), doppelt: () => undefined }))) continue;
      werte[nach.key] = w;
      for (const x of nach.typ === 'referenz' ? idsIn(w) : []) bezuege[x] = { titel: titel.get(x) ?? '', typId: typVon.get(x) ?? '' };
    }
    return { mappe: m, werte, bezuege };
  }

  /** Die Mappe `id` als Quelle für `f` (#1037): vom passenden Typ und mit dem Zugriff der Person lesbar – sonst null. */
  private async lesbareQuelle(f: Feld, id: string, z?: Zugriff): Promise<{ mappe: Mappe; typ: Mappentyp } | null> {
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || !zielErlaubt(f, m.typId)) return null;
    if (z && !z.admin && z.typen && !z.typen.has(m.typId)) return null;
    if (!(await this.lesbare(z, [m.id])).has(m.id)) return null;
    const typ = z?.typen?.get(m.typId) ?? await this.repo.holeTyp(m.typId);
    return typ ? { mappe: m, typ } : null;
  }

  /**
   * Beim Auswählen übernehmen (#1037) für die Oberfläche: Vorschläge der Mappe `id` im Verweisfeld `feldKey` des Typs
   * `typId` – je Zielfeld der Wert, dazu Titel und Typ der Mappe für die Kennzeichnung „vorgeschlagen aus …“ und die
   * Titel der Mappen in vorgeschlagenen Verweisen. Nicht lesbar oder unpassend: keine Felder.
   */
  async vorbelegen(e: unknown, z?: Zugriff): Promise<{ felder: Record<string, Wert>; titel: string; typId: string; bezuege: Record<string, MappenBezug> }> {
    const x = (e ?? {}) as { typId?: unknown; feldKey?: unknown; id?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    if (!typ || (z && !z.admin && z.typen && !z.typen.has(typ.id))) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-mappentyp'));
    const f = typ.felder.find((y) => y.key === x.feldKey && y.typ === 'referenz');
    const r = f && typeof x.id === 'string' ? await this.vorbelegteWerte(typ, f, x.id, z) : null;
    return r ? { felder: r.werte, titel: r.mappe.titel ?? '', typId: r.mappe.typId, bezuege: r.bezuege } : { felder: {}, titel: '', typId: '', bezuege: {} };
  }

  /**
   * Beim Auswählen übernehmen (#1037) beim Ausfüllen aus Dokumenten und auf „Dokument übernehmen“: Hat die Erkennung
   * für ein Verweisfeld eine Mappe vorgeschlagen, kommen deren Werte als Vorschlag dazu – nur für Felder ohne eigenen
   * Vorschlag aus dem Dokument (das Dokument geht vor), die `erlaubt` sind und in der Mappe `mappe` (beim Bearbeiten)
   * leer stehen. Läuft nach einer Erkennung per Paket: Diese Werte gehen nie an ein KI-Paket (#796).
   */
  async vorbelegenVorschlaege(typ: Mappentyp, v: { vorschlaege: Vorschlaege; bezuege: Record<string, MappenBezug>; neu: Record<string, unknown> }, erlaubt: (f: Feld) => boolean, mappe?: Mappe, z?: Zugriff): Promise<void> {
    for (const f of typ.felder) {
      if (f.typ !== 'referenz' || !f.vorbelegen?.length) continue;
      const vq = v.vorschlaege[f.key];
      const id = ersteId(vq?.wert);
      if (!vq || !istUuid(id)) continue;
      const r = await this.vorbelegteWerte(typ, f, id, z);
      if (!r) continue;
      const text = t('meldungen.dienst.vorbelegen-aus', { feld: f.label || f.key, titel: r.mappe.titel || t('meldungen.dienst.ohne-titel') });
      for (const [k, wert] of Object.entries(r.werte)) {
        const nach = typ.felder.find((x) => x.key === k);
        if (!nach || v.vorschlaege[k] || !erlaubt(nach) || (mappe && !istLeer(mappe.werte[k]))) continue;
        v.vorschlaege[k] = { wert, sicherheit: vq.sicherheit, fundstelle: text, aus: { feld: f.key, mappe: r.mappe.id } };
        delete v.neu[k];
      }
      Object.assign(v.bezuege, r.bezuege);
    }
  }

  /** Auswahlfilter (#172) in der Werkbank: wie viele Mappen der Zieltypen passen? `zielTypen` (#1036) oder wie bisher `zielTyp`. */
  async zaehleAuswahl(e: unknown, benutzerId: string) {
    const x = (e ?? {}) as { zielTyp?: unknown; zielTypen?: unknown; bedingungen?: unknown };
    const ids = zielTypenAus(x.zielTypen ?? x.zielTyp).filter(istUuid);
    const ziele: Mappentyp[] = [];
    for (const id of ids) { const z = await this.repo.holeTyp(id); if (z) ziele.push(z); }
    if (!ziele.length || ziele.length !== ids.length) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-ziel-mappentyp'));
    // Bedingungen mit Werten der eigenen Mappe (#173) zählen hier nicht – die Mappe gibt es noch nicht.
    const bed = setzeEigeneWerte(bereinigeAuswahlfilter(x.bedingungen), {});
    const [passen] = await this.repo.zaehleKlauseln([[auswahlKlausel(bed, ziele, await this.aufloesung(benutzerId))]], null);
    let gesamt = 0;
    for (const z of ziele) gesamt += await this.repo.zaehleMappen(z.id);
    return { passen, gesamt, probleme: auswahlProbleme(bed, { felder: gemeinsameFelder(ziele.map((z) => z.felder)) }) };
  }

  /** Verweise nur auf Mappen, die man sehen darf (#124, #137); bisherige Ziele bleiben erlaubt. */
  async pruefeVerweisziele(z: Zugriff | undefined, typ: Mappentyp, werte: Werte, alt: Werte) {
    if (!z || z.admin || !z.lesen) return;
    const vorher = new Set(verweiseVon(typ, alt).map((v) => v.zielId));
    const neu = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter((x) => istUuid(x) && !vorher.has(x));
    if (!neu.length) return;
    const ok = await this.repo.lesbare(neu, z.lesen);
    if (neu.some((x) => !ok.has(x))) throw new Fachfehler(422, t('meldungen.dienst.ein-verweis-zeigt-auf'));
  }

  /** Nach dem Speichern: Hat man sich selbst das Bearbeiten oder Lesen entzogen? (#126) */
  async hinweisDanach(z: Zugriff, id: string): Promise<string | undefined> {
    if (z.admin) return undefined;
    const m = await this.repo.holeMappe(id);
    if (!m) return undefined;
    const r = await this.rechteAn(z, m);
    if (!r.R) return t('meldungen.dienst.gespeichert-diese-mappe-kannst');
    if (!r.U) return t('meldungen.dienst.gespeichert-diese-mappe-kannst-2');
    return undefined;
  }

  /** Vor dem Speichern (#126): welche Rechte hätte man mit diesen Werten? */
  async rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> {
    const m = await this.pruefeRecht(z, id, 'U');
    const typ = z.typen.get(m.typId);
    if (!typ) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte, this.verschluessele);
    return this.rechteAn(z, { ...m, werte });
  }

  /**
   * Gleichzeitig bearbeiten (#609): übergebene Felder, die seit `stand` geändert wurden (laut Historie, Einträge
   * mit `stand`) und die die Eingabe jetzt anders setzen will. Gleicher Wert ist kein Konflikt.
   */
  async feldkonflikte(typ: Mappentyp, m: Mappe, werte: Werte, gesendet: string[], stand: string): Promise<Feldkonflikt[]> {
    const seit = new Map<string, Historieneintrag>();
    // Neueste zuerst: je Feld zählt die letzte Änderung.
    for (const h of await this.repo.historie(m.id)) {
      if (h.art !== 'geaendert' || typeof h.daten.stand !== 'string' || h.daten.stand <= stand) continue;
      for (const a of h.daten.aenderungen ?? []) if (!seit.has(a.feld)) seit.set(a.feld, h);
    }
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (istLeer(a as Werte[string]) && istLeer(b as Werte[string]));
    const felder = typ.felder.filter((f) => gesendet.includes(f.key) && seit.has(f.key) && !gleich(werte[f.key], m.werte[f.key]));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [werte[f.key], m.werte[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => (f.typ === 'passwort' ? '' : formatiere(f, v, (x) => titel.get(x) || t('meldungen.dienst.ohne-titel')).slice(0, 500));
    const liste: Feldkonflikt[] = [];
    for (const f of felder) {
      const h = seit.get(f.key)!;
      liste.push({
        feld: f.key, label: f.label, deins: lesbar(f, werte[f.key]), aktuell: lesbar(f, m.werte[f.key]),
        ...(f.typ === 'passwort' ? { geheim: true } : { wert: m.werte[f.key] ?? null }),
        von: h.benutzerId, name: h.benutzerId ? await this.kern.name(h.benutzerId) : t('mappen.konflikt.system'), zeit: h.zeit,
      });
    }
    return liste;
  }
}

/** Die Ziel-Mappentypen eines Verweisfelds, die es gibt (#1036). */
function zieltypenIn(f: Feld, typen: Map<string, Mappentyp>): Mappentyp[] {
  return zieleVon(f).map((id) => typen.get(id)).filter((x): x is Mappentyp => !!x);
}

/** Ids in einem Verweiswert (eine oder mehrere). */
const idsIn = (w: Wert): string[] => (Array.isArray(w) ? w : [w]).map(String);

/** Nur die lesbaren Mappen eines Verweiswerts (#1037); keine = null. */
function nurLesbare(f: Feld, w: Wert, lesbar: Set<string>): Wert | null {
  const l = idsIn(w).filter((x) => lesbar.has(x));
  return !l.length ? null : f.mehrfach ? l : l[0];
}

/**
 * Beim Auswählen übernehmen (#1037): je Paar des Verweisfelds `f` der Wert aus `werte` (Mappe vom Typ `quellTyp`) für
 * das Zielfeld – nur, wo beide Felder passen (passtZusammen, nie Passwörter), das Ziel von außen füllbar ist (nicht
 * berechnet) und etwas drinsteht. Ja/Nein „nein“ ist der Ausgangswert und schlägt nichts vor.
 */
function quellwerte(typ: Mappentyp, f: Feld, quellTyp: Mappentyp, werte: Werte): Array<{ nach: Feld; wert: Wert }> {
  const aus: Array<{ nach: Feld; wert: Wert }> = [];
  for (const p of f.vorbelegen ?? []) {
    const nach = typ.felder.find((x) => x.key === p.nach);
    const von = quellTyp.felder.find((x) => x.key === p.von);
    if (!nach || !von || nach.key === f.key || !passtZusammen(von, nach) || !vonAussenFuellbar(nach)) continue;
    const v = werte[von.key];
    if (istLeer(v) || v === false) continue;
    aus.push({ nach, wert: nach.mehrfach && !Array.isArray(v) ? [v as string] : v as Wert });
  }
  return aus;
}
