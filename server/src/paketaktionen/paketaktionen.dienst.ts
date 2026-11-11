/**
 * Paket-Aktionen im Menü „Mappe“ (#1039): welche Aktionen eine Person an einer Mappe sieht, und der Ablauf – Start,
 * Dialog, Antwort, Ergebnis. Das Paket liefert nur Daten; Ablago hält den Ablauf, prüft die Rechte bei jedem Schritt
 * und wendet das Ergebnis mit dem Zugriff der Person an.
 *
 * Regeln (Ergänzung Sicherheit, verbindlich):
 * - **Schnittmenge bei jedem Schritt:** angekündigte Rechte ∩ Rechte der Person ∩ Rechte des Pakets – beim Zeigen im
 *   Menü, beim Start, bei jedem weiteren Schritt und beim Anwenden des Ergebnisses. Herausgeben zählt wie Herunterladen
 *   (Recht E über die Prüfstelle, #723) und geht mit dem Pflicht-Stempel des Mappentyps hinaus.
 * - **Eigener, eingeschränkter Zugriff:** Während eines Schritts fragt das Paket nicht mit seinem Dienstkonto, sondern
 *   über `zugang()` – nur diese Mappe lesen, ihre Dokumente lesen (wenn das Paket Dokumente lesen darf) und Dateien für
 *   das Ergebnis ablegen. Alles andere: 403.
 * - **Ablauf bei Ablago:** Aktion, Mappe, Person und Schritt stehen im Lauf auf dem Server; das Paket bekommt nur die
 *   Kennung des Laufs. Mappe und Person kommen nie aus der Antwort des Pakets.
 * - **KI-Pakete** (#796): An Mappen gesperrter Typen bieten sie keine Aktion an und führen keine aus.
 * - **Bremse:** höchstens ein laufender Ablauf je Person und Paket; jeder Schritt mit Zeitgrenze.
 * - Historie der Mappe und Verlauf des Pakets nennen Person und Paket.
 *
 * Schicht 3 – bekommt Kern und Rechteprüfung; Paket-Läufer, Hochladen, Mappen ändern und anlegen, Prüfstelle und
 * Ausgabe über den Anschluss.
 */
import { randomUUID } from 'node:crypto';
import { zeigtAn } from '../../../shared/src/anzeige';
import { typKennung } from '../../../shared/src/kennungen';
import type { Dokument, Mappe, Mappentyp } from '../../../shared/src/model';
import {
  liesAktionenEinstellung, istEingebauteAktion, type AktionenAnMappe, type AktionenEinstellung, type AktionsDialog, type AktionsErgebnis, type AktionsSchritt,
  type AngeboteneAktion, type MappenAktion,
} from '../../../shared/src/paketaktionen';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import type { Rechte } from '../../../shared/src/rechte';
import { Fachfehler } from '../fehler';
import { AKTION_DATEI_MAX, AKTION_DATEIEN_MAX, AKTION_LAUF_MS, AKTION_ZEIT_MS, MB } from '../grenzen';
import type { Kern, Zugriff } from '../kern';
import { seitenInfo } from '../pdf';
import { hashe, type Kurzzustand } from '../kurzzustand';
import { protokoll } from '../protokoll';
import { istUuid } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { AntwortFehler, liesAntwort, pruefeAntworten, type PaketErgebnis } from './dialog';

const log = protokoll.modul('werkbank');

/** Einstellung mit den ausgeschalteten Aktionen (Werkbank, Teil der Sicherung). */
export const AKTIONEN_EINSTELLUNG = 'mappenaktionen';
/** Höchstens so viele Schritte mit Dialog; danach muss ein Ergebnis kommen. */
export const DIALOGE_MAX = 2;

/** Anfrage eines Pakets während eines Schritts (statt mit seinem Dienstkonto). */
export interface Zugangsanfrage { methode: string; pfad: string; body?: Buffer; typ?: string }
/** Eine Datei, die das Paket während eines Schritts ablegt (`POST /dateien`). */
export interface AktionsDatei { kennung: string; name: string; typ: string; inhalt: Buffer }
/**
 * Eigener, eingeschränkter Zugriff des Pakets während eines Schritts – als Daten, damit ihn auch der Läufer im Leiter
 * beantworten kann (mehrere Prozesse, #745): die Mappe (wie in der Eingabe) und die Dokumente, die das Paket lesen darf
 * (Id → Prüfwert der Datei). Ablegen von Dateien und alles andere beantwortet der Läufer mit {@link beantworteZugang}.
 */
export interface Zugang { mappe: Record<string, unknown>; dokumente: Record<string, string> }

/** Was der Paket-Läufer für Aktionen bietet (setzt der Läufer beim Start, wie bei „Frag deine Ablage“). */
export interface AktionsLaeufer {
  /** Hat der Läufer das Paket fehlerfrei geladen? */
  geladen(paket: string): boolean;
  /** Ein Schritt: Aufruf mit Antwort und Zeitgrenze; Anfragen des Pakets beantwortet der Läufer mit `zugang`. */
  rufe(paket: string, eingang: Record<string, unknown>, o: { ms: number; zugang: Zugang; bezeichnung: string }): Promise<{ ok: boolean; text: string; fehler: string | null; dateien: AktionsDatei[] }>;
}

const jsonAntwort = (status: number, x: unknown) => ({ status, body: Buffer.from(JSON.stringify(x)) });
const dateiname = (s: string) => s.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').trim().slice(0, 200) || 'datei';

/**
 * Anfrage des Pakets während eines Schritts beantworten (im Läufer): `GET /mappe`, `GET /dokumente/<id>` (nur die aus
 * `zugang.dokumente`), `POST /dateien?name=…&typ=…` (höchstens AKTION_DATEIEN_MAX, je AKTION_DATEI_MAX). Alles andere 403.
 */
export async function beantworteZugang(zugang: Zugang, dateien: AktionsDatei[], q: Zugangsanfrage, liesGanz: (sha256: string) => Promise<Buffer>): Promise<{ status: number; body: Buffer }> {
  const pfad = q.pfad.split('?')[0];
  if (q.methode === 'GET' && pfad === '/mappe') return jsonAntwort(200, zugang.mappe);
  const dok = /^\/dokumente\/([0-9a-f-]{36})$/.exec(pfad);
  if (q.methode === 'GET' && dok) {
    const sha = Object.hasOwn(zugang.dokumente, dok[1]) ? zugang.dokumente[dok[1]] : undefined;
    return sha ? { status: 200, body: await liesGanz(sha) } : jsonAntwort(404, { fehler: t('meldungen.paketaktionen.zugang-dokument') });
  }
  if (q.methode !== 'POST' || pfad !== '/dateien') return jsonAntwort(403, { fehler: t('meldungen.paketaktionen.zugang-verboten') });
  const query = new URLSearchParams(q.pfad.includes('?') ? q.pfad.slice(q.pfad.indexOf('?') + 1) : '');
  if (dateien.length >= AKTION_DATEIEN_MAX) return jsonAntwort(413, { fehler: t('meldungen.paketaktionen.zugang-dateien', { max: AKTION_DATEIEN_MAX }) });
  const inhalt = q.body ?? Buffer.alloc(0);
  if (!inhalt.length || inhalt.length > AKTION_DATEI_MAX) return jsonAntwort(413, { fehler: t('meldungen.paketaktionen.zugang-groesse', { max: AKTION_DATEI_MAX / MB }) });
  const angegeben = query.get('typ') ?? q.typ ?? '';
  const kennung = `d${dateien.length + 1}`;
  dateien.push({ kennung, name: dateiname(query.get('name') ?? kennung), typ: /^[\w.+-]+\/[\w.+-]+$/.test(angegeben) ? angegeben : 'application/octet-stream', inhalt });
  return jsonAntwort(201, { datei: kennung });
}

/** Wer handelt – Person mit Zugriff (Name für Verlauf und Stempel). */
export interface Handelnde { ich: { id: string; rolle: string; name: string }; z: Zugriff }

export interface PaketAktionenAnschluss {
  /** Zugriff des Dienstkontos eines Pakets (#338) – null, wenn es keins hat. */
  paketZugriff(paketId: string): Promise<Zugriff | null>;
  /** KI-Dienste (#796): Ist dieser Mappentyp für das Paket gesperrt? */
  kiSperre(paketId: string): Promise<(typId: string) => boolean>;
  /** Prüfstelle (#723): Welche Mappen darf die Person mitnehmen (Recht E)? */
  mitnehmbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>>;
  /** Hochladen wie jedes Dokument (Größe, Typ, Historie, Ereignis, Volltext), Herkunft „Paket“. */
  ladeHoch(mappeId: string, e: { register: string; name: string; typ: string }, inhalt: Buffer, von: string): Promise<{ dokument: Dokument }>;
  /** Mappe ändern wie über die Oberfläche (mit dem Zugriff der Person); `anlass` steht im Eintrag der Historie. */
  aendereMappe(id: string, werte: Record<string, unknown>, von: string, z: Zugriff, anlass: string): Promise<Mappe>;
  /** Mappe anlegen wie über die Oberfläche (mit dem Zugriff der Person). */
  legeMappeAn(typId: string, werte: Record<string, unknown>, von: string, z: Zugriff): Promise<Mappe>;
  /** Zustand zwischen Anfragen (#744): Läufe, Bremse und Datei zum Herausgeben – für alle Prozesse gleich. */
  kurzzustand(): Kurzzustand;
  /** Datei zum Herausgeben: Pflicht-Stempel des Mappentyps, Weitergabe in die Historie. */
  ausgabe(mappeId: string, d: { name: string; mime: string; inhalt: Buffer }, ich: { id: string; name: string }): Promise<{ name: string; mime: string; inhalt: Buffer }>;
}

/**
 * Ein Lauf im Kurzzustand (#744, für alle Prozesse gleich): Aktion, Mappe, Person, Schritt, offener Dialog und Stand
 * des Pakets. Schlüssel ist der Hash der Kennung. Dateien eines Schritts leben nur in diesem Schritt; die Datei zum
 * Herausgeben liegt bis zum Abholen getrennt (`AUSGABE`).
 */
interface Lauf {
  id: string; paket: { id: string; name: string }; aktion: MappenAktion; mappeId: string; personId: string;
  schritt: number; dialog: AktionsDialog | null; stand: unknown; fertig?: boolean;
}
const LAUF = 'paketaktion';
const AUSGABE = 'paketaktion-datei';
const SPERRE = 'paketaktion-sperre';

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class PaketAktionen {
  /** Paket-Läufer (#338) – setzt er selbst beim Start; ohne ihn laufen nur Aktionen mit Kern-Dialog. */
  laeufer?: AktionsLaeufer;

  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst, private readonly anschluss: PaketAktionenAnschluss) {}

  private get repo() { return this.kern.repo; }

  /* ---------- Einstellungen (Werkbank) ---------- */

  async einstellung(): Promise<AktionenEinstellung> { return liesAktionenEinstellung(await this.kern.einstellungen?.lies(AKTIONEN_EINSTELLUNG)); }

  /** Eingebaute Aktionen ausblenden (an einer Stelle in der Werkbank). */
  async setzeEingebaute(e: unknown): Promise<AktionenEinstellung> {
    const aus = (istObjekt(e) && Array.isArray(e.eingebautAus) ? e.eingebautAus : null);
    if (!aus || aus.some((x) => !istEingebauteAktion(x))) throw new Fachfehler(422, t('meldungen.paketaktionen.eingebaut-ungueltig'));
    return this.schreibe({ ...(await this.einstellung()), eingebautAus: [...new Set(aus.filter(istEingebauteAktion))] });
  }

  /** Aktionen eines Pakets ausschalten (Einstellungen des Pakets). */
  async setzePaketAus(paketId: string, e: unknown): Promise<AktionenEinstellung> {
    const p = (await this.repo.listePakete()).find((x) => x.id === paketId);
    if (!p) throw new Fachfehler(404, t('meldungen.paketaktionen.paket-fehlt'));
    const aus = istObjekt(e) && Array.isArray(e.aus) ? e.aus.map(String) : null;
    const bekannt = new Set((p.mappenaktionen ?? []).map((a) => a.schluessel));
    if (!aus || aus.some((x) => !bekannt.has(x))) throw new Fachfehler(422, t('meldungen.paketaktionen.aus-ungueltig'));
    const alt = await this.einstellung();
    const paketAus = { ...alt.paketAus, [paketId]: [...new Set(aus)] };
    if (!paketAus[paketId].length) delete paketAus[paketId];
    return this.schreibe({ ...alt, paketAus });
  }

  private async schreibe(e: AktionenEinstellung): Promise<AktionenEinstellung> {
    if (!this.kern.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.kern.einstellungen.schreibe(AKTIONEN_EINSTELLUNG, e.eingebautAus.length || Object.keys(e.paketAus).length ? e : null);
    return e;
  }

  /* ---------- Was im Menü steht ---------- */

  /** Aktionen an einer Mappe für diese Person: Rechte fehlen → nicht da; Bedingung trifft nicht zu → gesperrt mit Grund. */
  async angebot(h: Handelnde, mappeId: string): Promise<AktionenAnMappe> {
    const mappe = await this.rechte.pruefeRecht(h.z, mappeId, 'R');
    const typ = h.z.typen.get(mappe.typId) ?? await this.repo.holeTyp(mappe.typId);
    const einst = await this.einstellung();
    const aktionen: AngeboteneAktion[] = [];
    if (typ && !typ.system) {
      for (const { p, a } of await this.kandidaten(mappe)) {
        if (einst.paketAus[p.id]?.includes(a.schluessel)) continue;
        if (!a.dialog && !(p.laeufer?.modul)) continue;
        if (await this.fehlendesRecht(h, p, a, mappe)) continue;
        const gesperrt = a.bedingung && !(await this.bedingungTrifft(a, typ, mappe)) ? a.bedingung.grund : undefined;
        aktionen.push({ paket: { id: p.id, name: p.name }, schluessel: a.schluessel, name: a.name, ...(a.beschreibung ? { beschreibung: a.beschreibung } : {}), rechte: a.rechte, ...(a.dialog ? { dialog: a.dialog } : {}), ...(gesperrt ? { gesperrt } : {}) });
      }
    }
    return { aktionen: aktionen.sort((x, y) => x.name.localeCompare(y.name, 'de')), eingebautAus: einst.eingebautAus };
  }

  /** Aktionen, deren Mappentypen diese Mappe einschließen. */
  private async kandidaten(mappe: Mappe): Promise<Array<{ p: InstalliertesPaket; a: MappenAktion }>> {
    const pakete = await this.repo.listePakete();
    const typen = await this.repo.listeTypen();
    const r: Array<{ p: InstalliertesPaket; a: MappenAktion }> = [];
    for (const p of pakete) {
      if (!p.mappenaktionen?.length) continue;
      const aufloesen = await this.rechte.typverweise(p.id, pakete, typen);
      for (const a of p.mappenaktionen) if (aufloesen(a.mappentypen).has(mappe.typId)) r.push({ p, a });
    }
    return r;
  }

  private async bedingungTrifft(a: MappenAktion, typ: Mappentyp, mappe: Mappe): Promise<boolean> {
    if (!a.bedingung) return true;
    return zeigtAn(a.bedingung.regel, typ, mappe.werte, { merkmale: await this.kern.merkmale() });
  }

  /**
   * Die Schnittmenge (Ergänzung Sicherheit): Fehlt der Person oder dem Paket eins der angekündigten Rechte an dieser
   * Mappe, ist die Aktion nicht da. Liefert das fehlende Recht (für Meldung und Protokoll) oder null.
   */
  private async fehlendesRecht(h: Handelnde, p: InstalliertesPaket, a: MappenAktion, mappe: Mappe): Promise<string | null> {
    // KI-Dienste (#796): Ein Paket mit Netz bietet an gesperrten Typen nichts an.
    if ((await this.anschluss.kiSperre(p.id))(mappe.typId)) return 'ki';
    const person = await this.rechte.rechteAn(h.z, mappe);
    if (!person.R) return 'lesen';
    // Kern-Dialog: Das Paket handelt nicht selbst – es zählen angekündigte Rechte und die der Person.
    const pz = a.dialog ? null : await this.anschluss.paketZugriff(p.id);
    if (!a.dialog && !pz) return 'paket';
    const paket: Rechte | null = pz ? await this.rechte.rechteAn(pz, mappe) : null;
    for (const r of a.rechte) if (!(await this.hatRecht(r, { h, p, a, mappe, person, paket, pz }))) return r;
    // Ohne „lesen“ angekündigt bekommt das Paket die Werte trotzdem (es muss die Mappe kennen) – also braucht es Lesen.
    if (paket && !paket.R) return 'lesen';
    return null;
  }

  /** Ein angekündigtes Recht: Person und (ohne Kern-Dialog) Paket haben es an dieser Mappe. */
  private async hatRecht(r: MappenAktion['rechte'][number], x: { h: Handelnde; p: InstalliertesPaket; a: MappenAktion; mappe: Mappe; person: Rechte; paket: Rechte | null; pz: Zugriff | null }): Promise<boolean> {
    const auch = (k: keyof Rechte) => !x.paket || x.paket[k];
    if (r === 'lesen') return auch('R');
    if (r === 'dokument_hinzufuegen' || r === 'aendern') return x.person.U && auch('U');
    if (r === 'herausgeben') return auch('R') && (await this.anschluss.mitnehmbar(x.h.ich, x.h.z, [x.mappe.id])).has(x.mappe.id);
    const ziele = await this.zieltypen(x.p, x.a);
    if (!ziele.length) return false;
    for (const typId of ziele) {
      const entwurf = { id: '00000000-0000-4000-8000-000000000000', typId, werte: {}, erstellt: '', geaendert: '' } as unknown as Mappe;
      if (!(await this.rechte.rechteAn(x.h.z, entwurf, true)).C) return false;
      if (x.pz && !(await this.rechte.rechteAn(x.pz, entwurf, true)).C) return false;
    }
    return true;
  }

  private async zieltypen(p: InstalliertesPaket, a: MappenAktion): Promise<string[]> {
    const aufloesen = await this.rechte.typverweise(p.id, await this.repo.listePakete(), await this.repo.listeTypen());
    return [...aufloesen(a.anlegen ?? [])];
  }

  /* ---------- Ablauf ---------- */

  /** Aktion starten: Rechte und Bedingung prüfen, Lauf anlegen, ersten Schritt ausführen (oder Kern-Dialog melden). */
  async starte(h: Handelnde, mappeId: string, paketId: string, schluessel: string): Promise<AktionsSchritt> {
    if (!istUuid(mappeId)) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const { p, a, mappe } = await this.pruefe(h, mappeId, paketId, schluessel);
    const lauf: Lauf = { id: randomUUID(), paket: { id: p.id, name: p.name }, aktion: a, mappeId: mappe.id, personId: h.ich.id, schritt: 0, dialog: null, stand: null };
    if (a.dialog) {
      await this.merke(lauf);
      log.info('Paket-Aktion gestartet (Kern-Dialog)', { paket: p.id, aktion: a.schluessel, mappe: mappe.id, von: h.ich.id });
      return { lauf: lauf.id, paket: lauf.paket, aktion: a.schluessel, name: a.name, kern: a.dialog, rechte: a.rechte };
    }
    return this.schritt(h, lauf, {});
  }

  /** Nächster Schritt mit den Antworten der Person auf den Dialog. */
  async weiter(h: Handelnde, laufId: string, antworten: unknown): Promise<AktionsSchritt> {
    const lauf = await this.eigenerLauf(h, laufId);
    if (!lauf.dialog || lauf.fertig) throw new Fachfehler(409, t('meldungen.paketaktionen.kein-dialog'));
    const { werte, fehler } = pruefeAntworten(lauf.dialog, antworten);
    if (Object.keys(fehler).length) throw new Fachfehler(422, t('meldungen.paketaktionen.antworten-fehlen'), { felderFehler: fehler });
    // Bei jedem Schritt neu: Rechte, Bedingung, Paket noch da (Ergänzung Sicherheit).
    await this.pruefe(h, lauf.mappeId, lauf.paket.id, lauf.aktion.schluessel);
    return this.schritt(h, lauf, werte);
  }

  /** Lauf beenden (Dialog geschlossen). */
  async abbrechen(h: Handelnde, laufId: string): Promise<void> {
    const l = await this.lauf(laufId);
    if (l && l.personId === h.ich.id) await this.vergiss(laufId);
  }

  private zustand() { return this.anschluss.kurzzustand(); }
  private async lauf(id: string): Promise<Lauf | null> {
    if (!istUuid(id)) return null;
    return ((await this.zustand().lies(LAUF, hashe(id)))?.wert as Lauf | undefined) ?? null;
  }
  private merke(l: Lauf) { return this.zustand().setze(LAUF, hashe(l.id), l, Date.now() + AKTION_LAUF_MS); }
  private async vergiss(id: string) { await this.zustand().loesche(LAUF, hashe(id)); await this.zustand().loesche(AUSGABE, hashe(id)); }

  private async eigenerLauf(h: Handelnde, laufId: string): Promise<Lauf> {
    const l = await this.lauf(laufId);
    // Fremde Läufe gibt es für diese Person nicht – gleiche Antwort wie abgelaufen.
    if (!l || l.personId !== h.ich.id) throw new Fachfehler(404, t('meldungen.paketaktionen.lauf-fehlt'));
    return l;
  }

  /** Paket, Aktion, Mappe, Rechte, KI-Sperre, ausgeschaltet, Bedingung – bei jedem Schritt. */
  private async pruefe(h: Handelnde, mappeId: string, paketId: string, schluessel: string): Promise<{ p: InstalliertesPaket; a: MappenAktion; mappe: Mappe; typ: Mappentyp }> {
    const mappe = await this.rechte.pruefeRecht(h.z, mappeId, 'R');
    const typ = h.z.typen.get(mappe.typId) ?? await this.repo.holeTyp(mappe.typId);
    const p = (await this.repo.listePakete()).find((x) => x.id === paketId);
    const gefunden = p && typ ? (await this.kandidaten(mappe)).find((k) => k.p.id === paketId && k.a.schluessel === schluessel) : undefined;
    if (!p || !typ || typ.system || !gefunden) throw new Fachfehler(404, t('meldungen.paketaktionen.aktion-fehlt'));
    const a = gefunden.a;
    if ((await this.einstellung()).paketAus[p.id]?.includes(a.schluessel)) throw new Fachfehler(404, t('meldungen.paketaktionen.aktion-fehlt'));
    const fehlt = await this.fehlendesRecht(h, p, a, mappe);
    if (fehlt) {
      log.warn('Paket-Aktion abgelehnt: Recht fehlt', { paket: p.id, aktion: a.schluessel, mappe: mappe.id, recht: fehlt });
      throw new Fachfehler(403, t('meldungen.paketaktionen.recht-fehlt', { name: a.name }));
    }
    if (!(await this.bedingungTrifft(a, typ, mappe))) throw new Fachfehler(409, a.bedingung!.grund);
    return { p, a, mappe, typ };
  }

  /**
   * Was das Paket von der Mappe bekommt (Eingabe und `GET /mappe`): Werte ohne Passwortfelder; Dokumente nur, wenn das
   * Paket Dokumente lesen darf – die Person darf die Mappe lesen (eben geprüft). Dazu, was `GET /dokumente/<id>` liefert.
   */
  private async zugangFuer(lauf: Lauf): Promise<Zugang> {
    const mappe = await this.repo.holeMappe(lauf.mappeId);
    const typ = mappe ? await this.repo.holeTyp(mappe.typId) : undefined;
    if (!mappe || !typ) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const geheim = new Set(typ.felder.filter((f) => f.typ === 'passwort').map((f) => f.key));
    const werte = Object.fromEntries(Object.entries(mappe.werte).filter(([k]) => !geheim.has(k)));
    const pz = await this.anschluss.paketZugriff(lauf.paket.id);
    const doks = pz?.paket && pz.paket.dokumente !== 'keine' ? await this.repo.listeDokumente(mappe.id) : null;
    return {
      mappe: { id: mappe.id, typ: typKennung(typ.paket, typ.schluessel ?? ''), titel: mappe.titel ?? '', werte, ...(doks ? { dokumente: doks.map((d) => ({ id: d.id, name: d.name, mime: d.mime, groesse: d.groesse, register: d.registerKey })) } : {}) },
      dokumente: Object.fromEntries((doks ?? []).map((d) => [d.id, d.sha256])),
    };
  }

  /** Einen Schritt beim Paket ausführen und seine Antwort verarbeiten. Bremse: ein laufender Schritt je Person und Paket. */
  private async schritt(h: Handelnde, lauf: Lauf, antworten: Record<string, unknown>): Promise<AktionsSchritt> {
    const laeufer = this.laeufer;
    if (!laeufer?.geladen(lauf.paket.id)) { await this.vergiss(lauf.id); throw new Fachfehler(503, t('meldungen.paketaktionen.antwortet-nicht', { paket: lauf.paket.name })); }
    const sperre = `${h.ich.id}|${lauf.paket.id}`;
    if (!(await this.zustand().belege(SPERRE, sperre, AKTION_ZEIT_MS + 15_000))) throw new Fachfehler(429, t('meldungen.paketaktionen.laeuft-schon', { paket: lauf.paket.name }));
    lauf.schritt += 1;
    let r: Awaited<ReturnType<AktionsLaeufer['rufe']>>;
    try {
      const zugang = await this.zugangFuer(lauf);
      r = await laeufer.rufe(lauf.paket.id, {
        aktion: 'dms:mappenaktion', mappenaktion: lauf.aktion.schluessel, schritt: lauf.schritt, kennung: lauf.id,
        mappe: zugang.mappe, ...(lauf.schritt > 1 ? { antworten, stand: lauf.stand } : {}),
      }, { ms: AKTION_ZEIT_MS, zugang, bezeichnung: t('meldungen.paketaktionen.verlauf', { name: lauf.aktion.name, person: h.ich.name, schritt: lauf.schritt }) });
    } finally { await this.zustand().loesche(SPERRE, sperre); }
    return this.verarbeite(h, lauf, r);
  }

  /** Antwort des Pakets: Fehler, Dialog (höchstens DIALOGE_MAX) oder Ergebnis. */
  private async verarbeite(h: Handelnde, lauf: Lauf, r: Awaited<ReturnType<AktionsLaeufer['rufe']>>): Promise<AktionsSchritt> {
    const kopf = { lauf: lauf.id, paket: lauf.paket, aktion: lauf.aktion.schluessel, name: lauf.aktion.name };
    const ende = async (status: number, text: string, grund: string) => {
      await this.vergiss(lauf.id);
      log.warn('Paket-Aktion abgebrochen', { paket: lauf.paket.id, aktion: lauf.aktion.schluessel, grund });
      return new Fachfehler(status, text, { grund });
    };
    if (!r.ok) throw await ende(503, t('meldungen.paketaktionen.antwortet-nicht', { paket: lauf.paket.name }), r.fehler ?? '');
    let antwort;
    try { antwort = liesAntwort(r.text); } catch (e) {
      throw await ende(502, t('meldungen.paketaktionen.ungueltig', { paket: lauf.paket.name }), e instanceof AntwortFehler ? e.message : String(e));
    }
    if (antwort.art === 'dialog') {
      if (lauf.schritt > DIALOGE_MAX) throw await ende(502, t('meldungen.paketaktionen.zu-viele-schritte', { paket: lauf.paket.name, max: DIALOGE_MAX }), 'dialog');
      lauf.dialog = antwort.dialog; lauf.stand = antwort.stand;
      await this.merke(lauf);
      return { ...kopf, schritt: lauf.schritt, dialog: antwort.dialog };
    }
    try {
      return { ...kopf, ergebnis: await this.wendeAn(h, lauf, antwort.ergebnis, new Map(r.dateien.map((d) => [d.kennung, d]))) };
    } catch (e) { await this.vergiss(lauf.id); throw e; }
  }

  /**
   * Ergebnis anwenden – mit dem Zugriff der Person, nur was die Aktion angekündigt hat und Person und Paket dürfen
   * (eben noch einmal geprüft). Neue Dokumente wie ein Upload; PDFs müssen sich laden lassen.
   */
  private async wendeAn(h: Handelnde, lauf: Lauf, e: PaketErgebnis, dateien: Map<string, AktionsDatei>): Promise<AktionsErgebnis> {
    // Erst alles prüfen, dann schreiben – sonst bliebe bei einem Fehler die Hälfte liegen.
    const plan = await this.plane(h, lauf, e, dateien);
    const { mappe, typ, ziele, dok, register, raus } = plan;
    const a = lauf.aktion;
    const r: AktionsErgebnis = { meldung: e.meldung || t('meldungen.paketaktionen.erledigt', { name: a.name }) };
    if (e.felder && Object.keys(e.felder).length) {
      const neu = await this.anschluss.aendereMappe(mappe.id, e.felder, h.ich.id, h.z, t('meldungen.paketaktionen.historie', { name: a.name, paket: lauf.paket.name }));
      r.geaendert = typ.felder.filter((f) => f.key in e.felder! && JSON.stringify(mappe.werte[f.key] ?? null) !== JSON.stringify(neu.werte[f.key] ?? null)).map((f) => f.label);
    }
    if (dok && register) {
      const { dokument } = await this.anschluss.ladeHoch(mappe.id, { register: register.key, name: dok.name, typ: dok.typ }, dok.inhalt, h.ich.id);
      r.dokument = { id: dokument.id, name: dokument.name, registerKey: dokument.registerKey };
    }
    if (ziele.length) r.mappen = [];
    for (const z of ziele) {
      const m = await this.anschluss.legeMappeAn(z.typId, z.werte, h.ich.id, h.z);
      r.mappen!.push({ id: m.id, typId: m.typId, titel: m.titel ?? '' });
    }
    lauf.fertig = true; lauf.dialog = null;
    // Ohne Datei zum Abholen ist der Lauf zu Ende; sonst bleibt er bis zum Abholen (oder bis er abläuft).
    if (raus) {
      r.datei = { name: raus.name, groesse: raus.inhalt.length };
      await this.zustand().setze(AUSGABE, hashe(lauf.id), { name: raus.name, mime: raus.typ, inhalt: raus.inhalt.toString('base64') }, Date.now() + AKTION_LAUF_MS);
      await this.merke(lauf);
    } else await this.vergiss(lauf.id);
    await this.notiere(h, lauf, r);
    return r;
  }

  /** Ergebnis vor dem Schreiben prüfen: nur Angekündigtes, Dateien aus diesem Schritt, Register, lesbares PDF, Zieltypen. */
  private async plane(h: Handelnde, lauf: Lauf, e: PaketErgebnis, dateien: Map<string, AktionsDatei>) {
    const darf = (r: MappenAktion['rechte'][number]) => {
      if (!lauf.aktion.rechte.includes(r)) throw new Fachfehler(502, t('meldungen.paketaktionen.nicht-angekuendigt', { paket: lauf.paket.name }), { grund: r });
    };
    const mappe = await this.rechte.pruefeRecht(h.z, lauf.mappeId, 'R');
    const typ = await this.repo.holeTyp(mappe.typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const datei = (k: string) => { const d = dateien.get(k); if (!d) throw new Fachfehler(502, t('meldungen.paketaktionen.ungueltig', { paket: lauf.paket.name }), { grund: `datei ${k}` }); return d; };
    if (e.felder) darf('aendern');
    if (e.dokument) darf('dokument_hinzufuegen');
    if (e.mappen?.length) darf('mappen_anlegen');
    if (e.herausgeben) darf('herausgeben');
    const ziele = e.mappen?.length ? await this.anlegeZiele(lauf, e.mappen) : [];
    const dok = e.dokument ? datei(e.dokument.datei) : null;
    const dokRegister = typ.register.filter((r) => r.art === 'dokumente');
    const register = dok ? dokRegister.find((r) => r.key === e.dokument!.register) ?? dokRegister[0] : undefined;
    if (dok && !register) throw new Fachfehler(422, t('meldungen.paketaktionen.kein-register'));
    // Wie beim Upload: Ein PDF, das sich nicht laden lässt, kommt nicht in die Ablage.
    if (dok && (dok.typ === 'application/pdf' || dok.inhalt.subarray(0, 5).toString('latin1') === '%PDF-')) {
      try { await seitenInfo(dok.inhalt); } catch { throw new Fachfehler(422, t('meldungen.paketaktionen.pdf-kaputt', { name: dok.name })); }
    }
    return { mappe, typ, ziele, dok, register, raus: e.herausgeben ? datei(e.herausgeben.datei) : null };
  }

  /** Anzulegende Mappen: Typ aus `anlegen` der Aktion, Person und Paket dürfen dort anlegen. */
  private async anlegeZiele(lauf: Lauf, mappen: NonNullable<PaketErgebnis['mappen']>): Promise<Array<{ typId: string; werte: Record<string, unknown> }>> {
    const pakete = await this.repo.listePakete();
    const p = pakete.find((x) => x.id === lauf.paket.id);
    if (!p) throw new Fachfehler(404, t('meldungen.paketaktionen.aktion-fehlt'));
    const aufloesen = await this.rechte.typverweise(p.id, pakete, await this.repo.listeTypen());
    const erlaubt = aufloesen(lauf.aktion.anlegen ?? []);
    const pz = await this.anschluss.paketZugriff(p.id);
    return Promise.all(mappen.map(async (m) => {
      const typId = [...aufloesen([m.typ])][0];
      if (!typId || !erlaubt.has(typId)) throw new Fachfehler(502, t('meldungen.paketaktionen.nicht-angekuendigt', { paket: lauf.paket.name }), { grund: m.typ });
      const entwurf = { id: '00000000-0000-4000-8000-000000000000', typId, werte: m.werte, erstellt: '', geaendert: '' } as unknown as Mappe;
      if (!pz || !(await this.rechte.rechteAn(pz, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.paketaktionen.recht-fehlt', { name: lauf.aktion.name }));
      return { typId, werte: m.werte };
    }));
  }

  /** Historie der Mappe: Person (benutzerId) und Paket, Aktion und Ergebnis. */
  private async notiere(h: Handelnde, lauf: Lauf, r: AktionsErgebnis) {
    await this.repo.historieSchreibe([{ mappeId: lauf.mappeId, benutzerId: h.ich.id, art: 'paketaktion', daten: {
      text: t('meldungen.paketaktionen.historie', { name: lauf.aktion.name, paket: lauf.paket.name }),
      paket: lauf.paket.id, paketName: lauf.paket.name, aktion: lauf.aktion.schluessel, ergebnis: r.meldung,
      ...(r.dokument ? { dokument: r.dokument.name } : {}), ...(r.datei ? { datei: r.datei.name } : {}),
      ...(r.mappen?.length ? { mappen: r.mappen.length } : {}), ...(r.geaendert?.length ? { felder: r.geaendert } : {}),
    } }]);
    log.info('Paket-Aktion ausgeführt', { paket: lauf.paket.id, aktion: lauf.aktion.schluessel, mappe: lauf.mappeId, von: h.ich.id, dokument: !!r.dokument, mappen: r.mappen?.length, felder: r.geaendert?.length, datei: !!r.datei });
  }

  /**
   * Datei zum Herausgeben abholen (Recht E prüft die Route vorher über die Prüfstelle; hier noch einmal die Schnittmenge).
   * Pflicht-Stempel des Mappentyps wie beim Herunterladen; danach ist der Lauf zu Ende.
   */
  async datei(h: Handelnde, laufId: string): Promise<{ name: string; mime: string; inhalt: Buffer; mappeId: string }> {
    const lauf = await this.eigenerLauf(h, laufId);
    const roh = (await this.zustand().lies(AUSGABE, hashe(laufId)))?.wert as { name: string; mime: string; inhalt: string } | undefined;
    if (!roh) throw new Fachfehler(404, t('meldungen.paketaktionen.lauf-fehlt'));
    await this.pruefe(h, lauf.mappeId, lauf.paket.id, lauf.aktion.schluessel);
    const a = await this.anschluss.ausgabe(lauf.mappeId, { name: roh.name, mime: roh.mime, inhalt: Buffer.from(roh.inhalt, 'base64') }, { id: h.ich.id, name: h.ich.name });
    await this.vergiss(lauf.id);
    return { ...a, mappeId: lauf.mappeId };
  }

  /** Mappe eines Laufs (für die Prüfstelle der Route), nur für die eigene Person. */
  async mappeVon(h: Handelnde, laufId: string): Promise<string> { return (await this.eigenerLauf(h, laufId)).mappeId; }

  /* ---------- Kern-Dialog „Brief aus Vorlage“ (#1040) ---------- */

  /**
   * Vor dem Satz: Gehört der Lauf zu dieser Person und Mappe, ist es eine Aktion mit `dms:vorlage`, stammt die Vorlage
   * aus diesem Paket, und gelten die Rechte noch? Herunterladen nur, wenn die Aktion `herausgeben` ankündigt.
   */
  async vorlageLauf(h: Handelnde, laufId: string, mappeId: string, vorlagePaket: string | null, herunterladen: boolean): Promise<void> {
    const lauf = await this.eigenerLauf(h, laufId);
    if (lauf.aktion.dialog !== 'dms:vorlage' || lauf.mappeId !== mappeId || vorlagePaket !== lauf.paket.id) throw new Fachfehler(404, t('meldungen.paketaktionen.lauf-fehlt'));
    if (herunterladen && !lauf.aktion.rechte.includes('herausgeben')) throw new Fachfehler(403, t('meldungen.paketaktionen.recht-fehlt', { name: lauf.aktion.name }));
    await this.pruefe(h, mappeId, lauf.paket.id, lauf.aktion.schluessel);
  }

  /** Nach dem Satz: Historie mit Person und Paket; der Lauf ist zu Ende. */
  async vorlageErledigt(h: Handelnde, laufId: string, r: { dokument?: Dokument; datei?: string }): Promise<void> {
    const lauf = await this.eigenerLauf(h, laufId);
    const ergebnis: AktionsErgebnis = { meldung: r.dokument ? t('meldungen.paketaktionen.vorlage-abgelegt', { name: r.dokument.name }) : t('meldungen.paketaktionen.vorlage-heruntergeladen', { name: r.datei ?? '' }),
      ...(r.dokument ? { dokument: { id: r.dokument.id, name: r.dokument.name, registerKey: r.dokument.registerKey } } : {}), ...(r.datei ? { datei: { name: r.datei, groesse: 0 } } : {}) };
    await this.vergiss(lauf.id);
    await this.notiere(h, lauf, ergebnis);
  }
}
