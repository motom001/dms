/**
 * Datenschutz (#396, #455, #472, #668, #1078 aus dienst.ts): Einstellungen für Auskünfte, Prüfliste und Daten einer
 * Auskunft nach Art. 15 DSGVO, Nachweis, Antwortfrist und die Liste der Auskünfte; dazu die Demo-Daten (#248) – zählen,
 * entfernen, Dokumente anlegen. Schicht 3 – bekommt den Kern, Rechteprüfung, Mappen, Dokumente, Sichten, Ereignisse,
 * Aufgaben (Vertretung), das Löschen (Baum, Löschprotokoll) und die übrigen Klassen dieses Ordners (sie kennen einander
 * über `teile`); Konten, Kurzzustand, Tresor und den Export der Automatisierungen über den Anschluss.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { AufgabenVertretung } from '../aufgaben';
import type { AuskunftDaten } from '../auskunft';
import { dateiname, type DokumentArchivfassung, type DokumenteDienst, type DokumentUmwandlung, erkenneAnzeigbar } from '../dokumente';
import type { EreignisseDienst } from '../ereignisse/index';
import { Fachfehler } from '../fehler';
import { MB } from '../grenzen';
import type { Kern, Zugriff } from '../kern';
import type { Kurzzustand } from '../kurzzustand';
import type { LoeschprotokollVerwaltung } from '../loeschen';
import type { MitVerknuepften } from '../loeschen';
import type { MappenDienst, MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import type { SichtenDienst } from '../sichten';
import { t } from '../sprache';
import { istVerschluesselt } from '../tresor';
import type { ExportQuelle } from '../vollexport';
import { VolltextDienst } from '../volltext';
import type { ZugriffDienst } from '../zugriff';
import { aufbewahrenBis, datumText, laeuftNochNicht } from '../../../shared/src/archiv';
import { AUSKUNFT_PASSWORT_MIN, type AuskunftEintrag, type AuskunftErwaehnung, type AuskunftMappe, type AuskunftStand, auskunftVerzeichnis, type AuskunftVorschau, auswahlProbleme as auskunftProbleme, type Datenschutz, FRIST_SCHLUESSEL, FRIST_TEXT_ANFANG, fristBis, liesAuswahl, liesDatenschutz, personenTypen } from '../../../shared/src/auskunft';
import { erkenneBildtyp } from '../../../shared/src/dateiumwandlung';
import { alsText } from '../../../shared/src/markdown';
import { type Aufgabe, auswahlText, type Benutzer, istEmail, istLeer, type Mappe, type Mappentyp, MAX_DATEIGROESSE, verweiseVon, type Werte } from '../../../shared/src/model';
import { geschwaerztName, kannSchwaerzen } from '../../../shared/src/schwaerzen';
import { heuteIn } from '../../../shared/src/sichten';
import type { VollexportQuellen } from './vollexport';
import type { OrganisationDienst } from '../organisation';

/** Die Teile, die der Datenschutz ruft – dazu alle Klassen dieses Ordners (zusammengesetzt im Dienst). */
export interface DatenschutzTeile {
  rechte: ZugriffDienst; historie: MappenHistorie; mappen: MappenDienst; dokumente: DokumenteDienst; umwandlung: DokumentUmwandlung; archiv: DokumentArchivfassung;
  sichten: SichtenDienst; ereignisse: EreignisseDienst; vertretung: AufgabenVertretung; verknuepft: MitVerknuepften; loeschprotokoll: LoeschprotokollVerwaltung;
  datenschutz: DatenschutzDienst; vollexport: VollexportQuellen;
  /** Eigene Organisation (#995): Verantwortlicher für Auskunft und Löschkonzept. */
  organisation: OrganisationDienst;
}

/** Was der Datenschutz außer dem Kern braucht – vom Dienst hereingereicht. */
export interface DatenschutzAnschluss {
  /** Konten (#43), vom Start angebunden: aktive Personen für Benachrichtigungen. */
  konten(): { benutzer?(): Promise<Benutzer[]> } | undefined;
  /** Zustand zwischen Anfragen (#744; Belegung der Code-Prüfung am Abruf-Link). */
  kurzzustand(): Kurzzustand;
  /** Der Schlüssel (#39, #46; tresor.ts, beim Start gesetzt) – nur zum Entschlüsseln im Export. */
  tresor(): { entschluessele(wert: string): string | null } | undefined;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das am Dienst). */
  automatisierungenExport(): (() => Promise<unknown[]>) | undefined;
  /** Automatisierungsvorlagen mit Änderungsverlauf für den Vollexport (#1044). */
  ablaufvorlagenExport?(): Promise<unknown[]>;
}

export class DatenschutzDienst {
  constructor(private readonly kern: Kern, private readonly teile: DatenschutzTeile, private readonly anschluss: DatenschutzAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get einstellungen() { return this.kern.einstellungen; }
  private name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.teile.rechte.maskiereBezuege(...a); }
  private raeumeAuf(sha256: string) { return this.teile.dokumente.raeumeAuf(sha256); }
  private aktualisiereStatistik() { return this.teile.sichten.aktualisiereStatistik(); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.teile.ereignisse.neueAufgabe(a, typ); }
  private leiteUm(a: Aufgabe) { return this.teile.vertretung.leiteUm(a); }
  private baum(...a: Parameters<MitVerknuepften['baum']>) { return this.teile.verknuepft.baum(...a); }
  private vollexportQuelle(...a: Parameters<VollexportQuellen['vollexportQuelle']>) { return this.teile.vollexport.vollexportQuelle(...a); }

  /** Mappen je Typ, auch Systemtypen (#711: lassen sich Pflicht-Verweise der Demo-Daten füllen?). */
  async mappenJeTyp(): Promise<Map<string, number>> {
    const z = (await this.repo.zaehler('', false)).typen;
    return new Map([...z].map(([id, x]) => [id, x.anzahl]));
  }

  async demoUebersicht() {
    const demo = await this.repo.zaehleDemo();
    const z = (await this.repo.zaehler('', false)).typen;
    return (await this.repo.listeTypen()).filter((t) => !t.system).map((t) => ({
      typId: t.id, name: t.name, demo: demo.get(t.id) ?? 0, gesamt: z.get(t.id)?.anzahl ?? 0,
    }));
  }

  /** Alle Demo-Mappen samt Dokumenten entfernen – in Paketen mit Fortschritt (#248). */
  async entferneDemo(fortschritt: (fertig: number, gesamt: number) => void = () => {}, paket = 1000) {
    const echte = await this.repo.echteVerweiseAufDemo();
    if (echte) throw new Fachfehler(409, t('meldungen.dienst.echte-mappen-verweisen-auf', { anzahl: echte }));
    const gesamt = [...(await this.repo.zaehleDemo()).values()].reduce((a, b) => a + b, 0);
    let entfernt = 0;
    fortschritt(0, gesamt);
    for (;;) {
      const { anzahl, dateien } = await this.repo.loescheDemo(paket);
      for (const sha of dateien) await this.raeumeAuf(sha);
      entfernt += anzahl;
      fortschritt(Math.min(entfernt, gesamt), gesamt);
      if (anzahl < paket) break;
    }
    if (entfernt) await this.aktualisiereStatistik();
    return { entfernt };
  }

  /**
   * Demo-Dokument anlegen (#248): ohne Protokolleintrag je Datei und ohne „zuletzt geändert“ –
   * es sind tausende. Volltext wie beim Hochladen; eingereiht wird gesammelt (demoTexterkennung).
   */
  async legeDemoDokumentAn(mappeId: string, typ: Mappentyp, registerKey: string, name: string, mime: string, inhalt: Buffer, benutzerId: string | null) {
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    const d = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey, name: dateiname(name), mime: erkannt ?? erkenneBildtyp(inhalt) ?? mime,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    return { id: d.id, volltext: VolltextDienst.volltextAn(typ, registerKey) };
  }

  async datenschutz(): Promise<Datenschutz> { return liesDatenschutz(await this.einstellungen?.lies('datenschutz')); }

  /**
   * Einstellungen für Unterlagen an Dritte (#995): Deckblatt und E-Mails der Auskunft, Löschkonzept. Der Verantwortliche
   * kommt von der eigenen Organisation (Werkbank → Eigene Organisation); ohne sie gilt die bisherige Angabe.
   */
  async datenschutzFuerUnterlagen(): Promise<Datenschutz> {
    const d = await this.datenschutz();
    const text = await this.teile.organisation.verantwortlicherText();
    return text ? { ...d, verantwortlicher: text } : d;
  }

  async setzeDatenschutz(eingabe: unknown, von: string): Promise<Datenschutz> {
    const sys = await this.kern.system();
    const typen = new Set((await this.repo.listeTypen()).filter((t) => t.id !== sys.benutzer.id && t.id !== sys.rolle.id).map((t) => t.id));
    const d = liesDatenschutz(eingabe);
    d.typen = Object.fromEntries(Object.entries(d.typen).filter(([id]) => typen.has(id)));
    await this.einstellungen?.schreibe('datenschutz', d);
    protokoll.modul('datenschutz').info('Einstellungen für Auskünfte gespeichert', { von, personentypen: personenTypen(d).length });
    return d;
  }

  /** Inhalte je Mappe für die Prüfliste: Dokumente, Notizen, Historie, Hinweis auf Dritte. */
  private async auskunftInhalte(ids: string[], typen: Map<string, Mappentyp>, dritte: Map<string, string[]>): Promise<Record<string, AuskunftMappe>> {
    const r = this.repo;
    const mappen = new Map((await r.holeMappen(ids)).map((m) => [m.id, m] as const));
    const erg: Record<string, AuskunftMappe> = {};
    for (const id of ids) erg[id] = { dokumente: [], notizen: [], historie: 0, dritte: dritte.get(id) ?? [], ohneFelder: [] };
    for (let i = 0; i < ids.length; i += 500) {
      const teil = ids.slice(i, i + 500);
      const [doks, notizen, historie] = await Promise.all([r.dokumenteVon(teil), r.notizenVon(teil), r.historieVon(teil)]);
      const geschwaerzt = new Map<string, string>();
      for (const d of doks) if (d.herkunft === 'geschwaerzt') geschwaerzt.set(`${d.mappeId}|${d.name}`, d.id);
      for (const d of doks) {
        const typ = typen.get(mappen.get(d.mappeId)?.typId ?? '');
        erg[d.mappeId]?.dokumente.push({
          id: d.id, name: d.name, register: typ?.register.find((x) => x.key === d.registerKey)?.name ?? d.registerKey, mime: d.mime, groesse: d.groesse,
          geschwaerzt: d.herkunft === 'geschwaerzt',
          geschwaerzteFassung: d.herkunft === 'geschwaerzt' ? null : geschwaerzt.get(`${d.mappeId}|${geschwaerztName(d.name)}`) ?? null,
          aeltere: d.aeltere ?? 0, schwaerzbar: kannSchwaerzen(d.mime),
        });
      }
      for (const n of notizen) erg[n.mappeId]?.notizen.push({ id: n.id, erstellt: n.erstellt, text: alsText(n.text).slice(0, 300) });
      for (const h of historie) if (erg[h.mappeId]) erg[h.mappeId].historie++;
    }
    for (const [id, m] of mappen) {
      const typ = typen.get(m.typId);
      erg[id].ohneFelder = (typ?.felder ?? []).filter((f) => f.typ === 'passwort' && !istLeer(m.werte[f.key])).map((f) => f.label);
    }
    return erg;
  }

  /**
   * Prüfliste einer Auskunft (#396, #472): Baum ab der Mappe des Betroffenen (Tiefe einstellbar, Vorgabe 2,
   * beide Richtungen, nach oben nie wieder nach unten, ohne Benutzer und Rollen), nur über Verweise der Art
   * Zugehörigkeit weiter – Bezug-Mappen stehen als Blatt da (`nurBezug`). Je Mappe Dokumente, Notizen,
   * Historie. Keine Volltext-Vorschläge mehr (#472); die Eingabe `vorschlaege` wird ignoriert.
   */
  async auskunftVorschau(e: unknown, z: Zugriff): Promise<AuskunftVorschau> {
    const o = (e ?? {}) as Record<string, unknown>;
    const mappeId = String(o.mappeId ?? '');
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const baum = await this.baum(mappeId, { tiefe: o.tiefe, richtungen: o.richtungen, max: 1000, seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true }, z);
    const im = new Set(baum.knoten.map((k) => k.id));
    // „Daten Dritter?“: Nachbarn außerhalb der Sammlung, die selbst eine Person sind (Mappentyp „betrifft eine Person“).
    const person = new Set(personenTypen(await this.datenschutz()));
    const dritte = new Map(baum.knoten.map((k) => [k.id, [...new Set([...k.aussen.verweistAuf, ...k.aussen.verwiesenVon]
      .filter((a) => !!a.typId && person.has(a.typId) && !ohne.has(a.typId)).map((a) => a.titel))]] as [string, string[]]));
    const mappen = await this.auskunftInhalte([...im], z.typen, dritte);
    return { baum, mappen, frist: fristBis(heuteIn()) };
  }

  /**
   * Auskunft vorbereiten (#396): Auswahl gegen eine frische Sammlung prüfen und die Daten für die ZIP
   * zusammenstellen. Passwortfelder und verschlüsselte Werte fallen weg (auch aus den Mappentypen),
   * ältere Versionen von Dokumenten ebenso.
   */
  async auskunftDaten(e: unknown, z: Zugriff, x: { mandant: string; version: string }): Promise<AuskunftDaten> {
    const o = (e ?? {}) as Record<string, unknown>;
    if (o.geprueft !== true) throw new Fachfehler(422, t('meldungen.dienst.bitte-bestaetige-dass-du'));
    const vorschau = await this.auskunftVorschau({ mappeId: o.mappeId, tiefe: o.tiefe, richtungen: o.richtungen }, z);
    const bekannt = vorschau.mappen;
    const bezug = new Map(vorschau.baum.knoten.filter((k) => k.nurBezug && k.ueber).map((k) => [k.id, k] as const));
    const a = liesAuswahl(o.auswahl);
    const p = auskunftProbleme(a, bekannt, new Set(bezug.keys()));
    if (p.length) throw new Fachfehler(422, p.join(' '));
    // Bezug-Mappen (#472), die nicht ganz aufgenommen sind: nur Art, Titel und Feld.
    const erwaehnungen: AuskunftErwaehnung[] = a.erwaehnungen.filter((id) => !a.mappen.includes(id)).map((id) => bezug.get(id)!)
      .map((k) => ({ mappeId: k.id, typ: k.typ, titel: k.titel, feld: k.ueber!.feld, richtung: k.ueber!.richtung }));
    const passwort = typeof o.passwort === 'string' && o.passwort ? o.passwort : null;
    if (passwort && passwort.length < AUSKUNFT_PASSWORT_MIN) throw new Fachfehler(422, t('meldungen.dienst.das-passwort-fuer-die', { AUSKUNFT_PASSWORT_MIN }));
    const start = (await this.repo.holeMappe(vorschau.baum.startId))!;
    const ds = await this.datenschutzFuerUnterlagen();
    const ohneGeheim = (t: Mappentyp, w: Werte): Werte => Object.fromEntries(Object.entries(w).filter(([k, v]) => !istVerschluesselt(v) && t.felder.find((f) => f.key === k)?.typ !== 'passwort'));
    const mappen = (await this.repo.holeMappen(a.mappen)).filter((m) => z.typen.has(m.typId)).map((m) => ({ ...m, werte: ohneGeheim(z.typen.get(m.typId)!, m.werte) }));
    const typIds = new Set(mappen.map((m) => m.typId));
    const typen = [...typIds].map((id) => z.typen.get(id)!).map((t) => {
      const { berechtigungen: _b, stempel: _s, darfAnlegen: _d, ...rest } = t;
      return { ...rest, felder: t.felder.filter((f) => f.typ !== 'passwort') } as Mappentyp;
    });
    const dok = new Set(a.dokumente); const not = new Set(a.notizen); const hist = new Set(a.historie);
    const mitZurueckgehaltenen = new Set(Object.entries(bekannt).filter(([id, x]) => a.mappen.includes(id) && x.notizen.some((n) => !not.has(n.id))).map(([id]) => id));
    const jeTyp = new Map<string, Mappe[]>();
    for (const m of mappen) jeTyp.set(m.typId, [...jeTyp.get(m.typId) ?? [], m]);
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    const quelle: ExportQuelle = {
      ...voll,
      typen: async () => typen, sichten: async () => [], nummernkreise: async () => [], pakete: async () => [],
      mappen: async (typId) => jeTyp.get(typId) ?? [],
      papierkorb: async () => [], papierkorbDokumente: async () => [],
      // Nicht für Dritte (#683): Löschprotokoll, Synonyme und Automatisierungen betreffen den ganzen Haushalt.
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined,
      // Notfallkontakte (#812, Suche nach Adresse): eingetragen mit einer Adresse, die in den aufgenommenen Mappen steht –
      // so bekommt auch ein Notfallkontakt, der Auskunft verlangt, seine Angaben.
      notfallkontakte: async () => {
        const adressen = new Set(mappen.flatMap((m) => Object.values(m.werte)).flatMap((v) => (Array.isArray(v) ? v : [v]))
          .filter((v): v is string => typeof v === 'string' && istEmail(v.trim())).map((v) => v.trim().toLowerCase()));
        return adressen.size ? (await this.repo.notfallkontakte()).filter((k) => adressen.has(k.email.toLowerCase())) : [];
      },
      dokumente: async (ids) => (await this.repo.dokumenteVon(ids)).filter((d) => dok.has(d.id)),
      versionen: async () => [],
      // Die Auskunft enthält die Dokumente, wie sie abgelegt sind – ohne Fassungen von Paketen (#577).
      fassung: undefined,
      archivfassung: undefined,
      notizen: async (ids) => (await this.repo.notizenVon(ids)).filter((n) => not.has(n.id)),
      aufgaben: async () => [], ablaeufe: async () => [], favoriten: async () => [],
      // Historie: ohne frühere Auskünfte (deren Begründungen sind intern); Mappen mit zurückgehaltenen
      // Notizen ohne Notiz-Einträge – die Historie nennt den Text einer Notiz.
      historie: async (ids) => (await this.repo.historieVon(ids)).filter((h) => hist.has(h.mappeId) && h.art !== 'auskunft' && !(h.art === 'notiz' && mitZurueckgehaltenen.has(h.mappeId))),
      passwort: () => null,
    };
    // Herkunft (Kanal der Post) und Speicherdauer (Archivmodus) für das Deckblatt.
    const post = (await this.kern.system()).post;
    const kanaele: Record<string, number> = {};
    for (const m of jeTyp.get(post.id) ?? []) { const k = auswahlText(m.werte.kanal) || 'unbekannt'; kanaele[k] = (kanaele[k] ?? 0) + 1; }
    const dokumente = (await this.repo.dokumenteVon(a.mappen)).filter((d) => dok.has(d.id));
    const ziele = mappen.flatMap((m) => [...verweiseVon(z.typen.get(m.typId)!, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
    const titel = Object.fromEntries(Object.entries(await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(ziele)]))).map(([id, b]) => [id, b.titel]));
    return {
      titel,
      start: { id: start.id, titel: start.titel ?? '', typ: z.typen.get(start.typId)?.name ?? '' },
      datenschutz: ds, quelle, mappen, typen, kanaele, passwort,
      erwaehnungen,
      anzahl: { mappen: mappen.length, dokumente: dokumente.length, bytes: dokumente.reduce((s, d) => s + d.groesse, 0), notizen: not.size, historie: hist.size, ohneNotizen: a.ohneNotizen.filter((n) => !not.has(n.id)).length, erwaehnungen: erwaehnungen.length },
      gruende: a.ohneNotizen.filter((n) => !not.has(n.id)).map((n) => n.grund),
      empfaenger: typeof o.empfaenger === 'string' ? o.empfaenger.trim().slice(0, 2000) : ds.empfaenger,
      anmerkung: typeof o.anmerkung === 'string' ? o.anmerkung.trim().slice(0, 2000) : '',
      aufbewahrung: typen.map((t) => {
        const bis = (jeTyp.get(t.id) ?? []).map((m) => aufbewahrenBis(t.archiv, m)).filter((b): b is string => !!b).sort();
        // Läuft die Frist bei einer Mappe noch nicht (#1051), gibt es kein „längstens bis“.
        const offen = (jeTyp.get(t.id) ?? []).some((m) => laeuftNochNicht(t.archiv, m));
        return { typ: t.name, archiv: t.archiv ? { jahre: t.archiv.jahre, stichtag: t.archiv.stichtag ? t.felder.find((f) => f.key === t.archiv!.stichtag)?.label ?? t.archiv.stichtag : null } : null, bis: offen ? null : bis.at(-1) ?? null, ...(offen ? { offen: true } : {}) };
      }),
    };
  }

  /** Nachweis (#396): Historie des Betroffenen und Protokoll – nur Zahlen, keine Inhalte. */
  async auskunftNachweis(d: AuskunftDaten, von: { id: string; email: string }, info: { id: string; bytes: number }) {
    const n = d.anzahl;
    await this.notiere(d.start.id, von.id, 'auskunft', {
      text: t('meldungen.dienst.auskunft-nach-art-15', { mappen: n.mappen, wert: t('meldungen.dienst.mappen', { anzahl: n.mappen }), dokumente: n.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: n.dokumente }) }),
      mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, historie: n.historie, ohneNotizen: n.ohneNotizen, ...(n.erwaehnungen ? { erwaehnungen: n.erwaehnungen } : {}),
      ...(d.gruende.length ? { gruende: d.gruende } : {}), verschluesselt: !!d.passwort, auskunft: info.id,
    });
    protokoll.modul('datenschutz').info('Auskunft erstellt', { mappeId: d.start.id, mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, ohneNotizen: n.ohneNotizen, verschluesselt: !!d.passwort, mb: Math.round(info.bytes / MB), von: von.email });
  }

  /** Frist (#396): Aufgabe „Auskunft an … bis <Eingang + 1 Monat>“ am Betroffenen, für den Administrator. */
  async auskunftFrist(e: unknown, z: Zugriff, von: string): Promise<Aufgabe> {
    const o = (e ?? {}) as Record<string, unknown>;
    const m = await this.pruefeRecht(z, String(o.mappeId ?? ''), 'R');
    const eingang = typeof o.eingang === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.eingang) ? o.eingang : heuteIn();
    const bis = fristBis(eingang);
    const text = t('meldungen.dienst.auskunft-nach-art-15-2', { wert: m.titel || t('meldungen.dienst.ohne-titel'), datumText: datumText(bis), datumText2: datumText(eingang) });
    // feldKey (#668): so findet die Liste der Auskünfte die Antwortfrist wieder.
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: m.id, empfaengerId: von, art: 'manuell', feldKey: FRIST_SCHLUESSEL, text, datum: bis, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(m.id, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name: await this.name(von), text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: von, aufgabentext: text });
    return this.leiteUm(a);
  }

  /**
   * Liste der Auskünfte (#668): aus Historie (Nachweis auch nach dem Löschen der ZIP), bereitliegenden Dateien und
   * offenen Antwortfristen. `laufend`: der gerade erzeugte Auftrag (nur einer zur Zeit).
   */
  async auskunftVerzeichnis(bereit: AuskunftStand[], laufend?: { id: string; titel: string; gestartet: string } | null): Promise<AuskunftEintrag[]> {
    const historie = await this.repo.historieArt('auskunft', 2000);
    const fristen = (await this.repo.offeneAufgaben({})).filter((a) => a.art === 'manuell' && (a.feldKey === FRIST_SCHLUESSEL || a.text.startsWith(FRIST_TEXT_ANFANG)));
    const ids = [...new Set([...historie.map((h) => h.mappeId), ...historie.map((h) => h.benutzerId).filter((x): x is string => !!x), ...fristen.map((f) => f.mappeId)])];
    const titel = await this.repo.titelVon(ids);
    const namen = new Map([...titel].map(([k, v]) => [k, v.replace(/ \(ehemalig\)$/, '')]));
    return auskunftVerzeichnis({
      historie: historie.map((h) => ({ mappeId: h.mappeId, zeit: h.zeit, benutzerId: h.benutzerId, daten: h.daten as Record<string, unknown> })),
      bereit, titel, namen, laufend: laufend ?? null,
      fristen: fristen.map((f) => ({ id: f.id, mappeId: f.mappeId, mappeTitel: f.mappeTitel, datum: f.datum ?? null, erstellt: f.erstellt })),
    });
  }

  /** Nachweis (#668): Herunterladen bzw. Löschen einer Auskunft in der Historie der Person – ohne Inhalte. */
  async auskunftNotiz(stand: { id: string; mappeId: string }, von: string, art: 'download' | 'geloescht') {
    await this.notiere(stand.mappeId, von, 'auskunft', art === 'download'
      ? { text: t('meldungen.dienst.auskunft-heruntergeladen'), zustellung: 'download', auskunft: stand.id }
      : { text: t('meldungen.dienst.auskunft-geloescht'), geloescht: true, auskunft: stand.id });
  }
}
