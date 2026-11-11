/**
 * Inhalte übersetzen auf Knopfdruck (#732), Seite des Servers. Gemeinsames (Grenzen, Abschnitte, Einstellung) steht in
 * shared/src/uebersetzung.ts.
 *
 * Ablauf: Die Oberfläche schickt nur, **was** übersetzt werden soll (Feld einer Mappe, Notiz, Volltext eines Dokuments)
 * und welchen Abschnitt. Der Kern prüft das Leserecht der Person, liest den Text selbst, teilt ihn in Abschnitte und
 * gibt dem Paket mit `dms:uebersetzen` genau einen Abschnitt – ohne Mappe, ohne Kennungen, ohne Rechte. Das Ergebnis
 * kommt in den Zwischenspeicher (Kurzzustand, #744: für alle Prozesse gleich, nicht in der Sicherung) unter dem
 * Prüfwert des Abschnitts, der Zielsprache, dem Paket und seiner Version. Ändert sich das Original, passt der Prüfwert
 * nicht mehr: Die alte Übersetzung gilt nicht und wird beim nächsten Abruf bzw. mit dem Ereignis der Änderung gelöscht.
 */
import { createHash } from 'node:crypto';
import type { KatalogEreignis } from '../../shared/src/ereignisse';
import { hatNetz, hatSchnittstelle, type InstalliertesPaket } from '../../shared/src/pakete';
import { erkenneSprache } from '../../shared/src/textsprache';
import {
  abschnitte, liesUebersetzenEinstellung, spracheAusTesseract, SPRACHKENNUNG_KURZ, UEBERSETZBARE_FELDER, UEBERSETZEN_MS, UEBERSETZEN_TEXT_MAX,
  UEBERSETZUNG_TAGE, type UebersetzenAngebot, type UebersetzenEinstellung, type Uebersetzt, type Uebersetzungsquelle,
} from '../../shared/src/uebersetzung';
import type { Benutzer } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { Zugriff } from './kern';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import type { Kurzzustand } from './kurzzustand';
import { protokoll } from './protokoll';
import type { Repo } from './repo';
import { t } from './sprache';

const log = protokoll.modul('ablage');

/** Wer übersetzt: der Paket-Läufer mit den geladenen Paketen, die dms:uebersetzen haben. */
export interface UebersetzAnbieter {
  pakete(): Array<{ id: string; name: string; version: string; netz: boolean }>;
  uebersetze(paket: string, eingang: Record<string, unknown>, ms: number): Promise<{ text: string; ms: number }>;
}

/** Art im Kurzzustand. */
export const ZWISCHENSPEICHER = 'uebersetzung';
/** Sicherheit der eingebauten Spracherkennung, ab der der Kern „schon in deiner Sprache“ annimmt. */
const GLEICH_AB = 0.5;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Schlüssel im Zwischenspeicher: Mappe | Quelle | Prüfwert | Zielsprache | Paket@Version. */
const praefix = (mappe: string, quelle?: string) => `${mappe}|${quelle ? `${quelle}|` : ''}`;
const quelleText = (q: Uebersetzungsquelle) => (q.art === 'feld' ? `feld:${q.feld}` : q.art === 'notiz' ? `notiz:${q.notiz}` : `volltext:${q.dokument}`);

/** Quelle aus der Anfrage prüfen (nur Kennungen, kein Text). */
export function liesQuelle(x: unknown): Uebersetzungsquelle {
  const q = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  const id = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
  if (q.art === 'feld' && id(q.mappe) && typeof q.feld === 'string' && /^[a-z0-9_]{1,64}$/.test(q.feld)) return { art: 'feld', mappe: q.mappe as string, feld: q.feld };
  if (q.art === 'notiz' && id(q.notiz)) return { art: 'notiz', notiz: q.notiz as string };
  if (q.art === 'volltext' && id(q.dokument)) return { art: 'volltext', dokument: q.dokument as string };
  throw new Fachfehler(422, t('meldungen.uebersetzung.quelle-unbekannt'));
}

/** Wohin der Text geht, wenn das Paket ins Netz darf: Rechner der festen Adressen und die Dienst-Adressen. */
function netzZiele(p: InstalliertesPaket): string[] | null {
  if (!hatNetz(p.laeufer)) return null;
  const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
  return [...new Set([...(p.laeufer!.netz ?? []).map(host), ...(p.laeufer!.adressen ?? []).map((a) => t('meldungen.uebersetzung.dienst-adresse', { name: a.name }))])];
}

export class Uebersetzung {
  /** Wird gesetzt, sobald der Paket-Läufer läuft (verwaltung.ts bzw. fern.ts). */
  anbieter?: UebersetzAnbieter;

  constructor(private d: Dienst, private repo: () => Repo, private einst: () => Einstellungen | undefined, private zustand: () => Kurzzustand) {}

  async einstellung(): Promise<UebersetzenEinstellung> {
    return liesUebersetzenEinstellung(await this.einst()?.lies('uebersetzen'));
  }

  /** Installierte Pakete mit dms:uebersetzen; `laeuft`: der Läufer hat es fehlerfrei geladen. */
  private async pakete(): Promise<Array<{ p: InstalliertesPaket; laeuft: boolean; netz: string[] | null }>> {
    const geladen = new Set((this.anbieter?.pakete() ?? []).map((x) => x.id));
    return (await this.repo().listePakete()).filter((p) => hatSchnittstelle(p.laeufer, 'dms:uebersetzen'))
      .sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({ p, laeuft: geladen.has(p.id), netz: netzZiele(p) }));
  }

  /**
   * Das Paket, das übersetzt – oder null. Gewählt: nur, wenn es läuft und (bei Netz) der Abfluss bestätigt ist.
   * Ohne Wahl: das erste laufende Paket ohne Netz; ein Paket mit Netz nie stillschweigend (#701).
   */
  private async wirksam(e?: UebersetzenEinstellung) {
    const s = e ?? await this.einstellung();
    if (!s.an) return null;
    const alle = (await this.pakete()).filter((x) => x.laeuft);
    if (s.paket) {
      const x = alle.find((y) => y.p.id === s.paket);
      return x && (!x.netz || s.abfluss) ? x : null;
    }
    return alle.find((x) => !x.netz) ?? null;
  }

  /** Für die Werkbank: Einstellung, Pakete und welches gerade übersetzt. */
  async stand() {
    const e = await this.einstellung();
    const w = await this.wirksam(e);
    return {
      einstellung: e,
      pakete: (await this.pakete()).map((x) => ({ id: x.p.id, name: x.p.name, version: x.p.version, laeuft: x.laeuft, netz: x.netz })),
      wirksam: w ? { id: w.p.id, name: w.p.name } : null,
    };
  }

  /** Werkbank: speichern. Ein Paket mit Netz braucht die ausdrückliche Bestätigung (409 mit details.abfluss). */
  async setze(e: unknown) {
    const s = this.einst();
    if (!s) throw new Fachfehler(404, t('meldungen.erkennung.einstellungen-sind-nicht'));
    const x = (e ?? {}) as Record<string, unknown>;
    const neu = liesUebersetzenEinstellung({ ...await this.einstellung(), ...x });
    if (neu.paket) {
      const p = (await this.pakete()).find((y) => y.p.id === neu.paket);
      if (!p) throw new Fachfehler(422, t('meldungen.uebersetzung.kein-paket', { paket: neu.paket }));
      if (p.netz && !neu.abfluss) throw new Fachfehler(409, t('meldungen.uebersetzung.abfluss-bestaetigen', { name: p.p.name, ziele: p.netz.join(', ') }), { abfluss: true, paket: p.p.name, ziele: p.netz });
      if (!p.netz) delete neu.abfluss;
    }
    await s.schreibe('uebersetzen', neu);
    log.info('Übersetzen eingestellt', { an: neu.an, paket: neu.paket ?? 'automatisch', abfluss: !!neu.abfluss });
    return this.stand();
  }

  /** Angebot für eine Person (Kontostand): null = kein Knopf und kein Schalter (aus für alle oder kein Paket). */
  async angebot(b: Benutzer, nach: string): Promise<UebersetzenAngebot | null> {
    if (b.art) return null;
    const w = await this.wirksam();
    if (!w) return null;
    return { paket: { id: w.p.id, name: w.p.name }, nach, netz: w.netz, aus: b.uebersetzen === false };
  }

  /** Den Text lesen – mit den Rechten der Person. Liefert die Mappe (für den Zwischenspeicher) und Hinweise zur Sprache. */
  private async lies(q: Uebersetzungsquelle, z: Zugriff): Promise<{ mappe: string; text: string; format: 'text' | 'markdown'; von: string | null; gemischt: boolean }> {
    if (q.art === 'feld') {
      const m = await this.d.rechtepruefung.pruefeRecht(z, q.mappe, 'R');
      const typ = z.typen.get(m.typId) ?? await this.repo().holeTyp(m.typId);
      const f = typ?.felder.find((x) => x.key === q.feld);
      if (!f || !(UEBERSETZBARE_FELDER as readonly string[]).includes(f.typ) || (f.typ === 'text' && f.format)) throw new Fachfehler(422, t('meldungen.uebersetzung.feld-nicht'));
      const v = m.werte[q.feld];
      return { mappe: m.id, text: typeof v === 'string' ? v : '', format: f.typ === 'formatiert' ? 'markdown' : 'text', von: null, gemischt: false };
    }
    if (q.art === 'notiz') {
      const n = await this.repo().holeNotiz(q.notiz);
      if (!n) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
      await this.d.rechtepruefung.pruefeRecht(z, n.mappeId, 'R');
      return { mappe: n.mappeId, text: n.text, format: 'markdown', von: null, gemischt: false };
    }
    const mappe = await this.d.rechtepruefung.mappeVon('dokument', q.dokument);
    await this.d.rechtepruefung.pruefeRecht(z, mappe, 'R');
    const v = await this.d.volltexte.volltext(q.dokument);
    // Sprache aus der Texterkennung (#400) als Hinweis für das Paket.
    return { mappe, text: v.text ?? '', format: 'text', von: spracheAusTesseract(v.dokument.sprache), gemischt: !!v.dokument.weitereSprachen?.length };
  }

  /**
   * Einen Abschnitt übersetzen. Wirft 404/403 ohne Leserecht, 409 ohne Paket bzw. wenn die Person es abgeschaltet hat,
   * 422 bei leerem Text oder unbekanntem Abschnitt, 502, wenn das Paket nicht oder unbrauchbar antwortet.
   */
  async uebersetze(q: Uebersetzungsquelle, o: { teil?: unknown; nach: string; ich: Benutzer; z: Zugriff }): Promise<Uebersetzt> {
    if (o.ich.art) throw new Fachfehler(403, t('meldungen.uebersetzung.nur-personen'));
    if (o.ich.uebersetzen === false) throw new Fachfehler(409, t('meldungen.uebersetzung.selbst-aus'));
    const w = await this.wirksam();
    if (!w || !this.anbieter) throw new Fachfehler(409, t('meldungen.uebersetzung.kein-angebot'));
    const quelle = await this.lies(q, o.z);
    // KI-Dienste (#796): Inhalte aus nicht zugelassenen Mappentypen gehen an kein KI-Paket.
    const typ = (await this.repo().holeMappe(quelle.mappe))?.typId;
    if (!typ || (await this.d.ki.kiSperreFuer(w.p.id))(typ)) throw new Fachfehler(409, t('meldungen.uebersetzung.ki-nicht-zugelassen', { name: w.p.name }));
    const gekuerzt = quelle.text.length > UEBERSETZEN_TEXT_MAX;
    const original = gekuerzt ? quelle.text.slice(0, UEBERSETZEN_TEXT_MAX) : quelle.text;
    if (!original.trim()) throw new Fachfehler(422, t('meldungen.uebersetzung.leer'));
    const teile = abschnitte(original);
    const teil = o.teil === undefined ? 0 : Number(o.teil);
    if (!Number.isInteger(teil) || teil < 0 || teil >= teile.length) throw new Fachfehler(422, t('meldungen.uebersetzung.abschnitt-unbekannt', { teile: teile.length }));
    const paket = { id: w.p.id, name: w.p.name, version: w.p.version };
    const basis = { teil, teile: teile.length, trenner: teile[teil].trenner, nach: o.nach, paket, netz: w.netz, pruefwert: sha(quelle.text), ...(gekuerzt ? { gekuerzt: true as const } : {}) };
    // Ausgangssprache: aus der Texterkennung, sonst mit der eingebauten Erkennung (#395) am ganzen Text.
    const erkannt = erkenneSprache(original);
    const von = quelle.von ?? (erkannt && erkannt.konfidenz >= GLEICH_AB ? spracheAusTesseract(erkannt.sprache) : null);
    // Schon in der Sprache der Person (eindeutig und nicht gemischt): nichts übersetzen, nichts an das Paket.
    if (von === o.nach && !quelle.gemischt && (quelle.von || (erkannt?.konfidenz ?? 0) >= GLEICH_AB)) {
      return { ...basis, teil: 0, teile: 1, trenner: '', text: original, von, gleich: true };
    }
    const qt = quelleText(q);
    const kz = this.zustand();
    if (teil === 0) await this.raeumeAuf(quelle.mappe, qt, new Set(teile.map((x) => sha(x.text))), paket);
    const abschnitt = teile[teil].text;
    // Nur Leerraum (z. B. leere Seite): bleibt, wie er ist.
    if (!abschnitt.trim()) return { ...basis, text: abschnitt, von };
    const schluessel = `${praefix(quelle.mappe, qt)}${sha(abschnitt)}|${o.nach}|${paket.id}@${paket.version}`;
    const alt = await kz.lies(ZWISCHENSPEICHER, schluessel).catch(() => null);
    const gemerkt = alt?.wert as { text?: unknown; von?: unknown } | undefined;
    if (gemerkt && typeof gemerkt.text === 'string') {
      return { ...basis, text: gemerkt.text, von: typeof gemerkt.von === 'string' ? gemerkt.von : von, gespeichert: true };
    }
    const eingang = { text: abschnitt, nach: o.nach, von, art: q.art, format: quelle.format, teil, teile: teile.length };
    let antwort: { text: string };
    try { antwort = await this.anbieter.uebersetze(paket.id, eingang, UEBERSETZEN_MS); }
    catch (e) { throw new Fachfehler(502, t('meldungen.uebersetzung.paket-fehler', { name: paket.name, grund: (e as Error).message })); }
    const r = liesAntwort(antwort.text);
    if ('fehler' in r) throw new Fachfehler(502, t('meldungen.uebersetzung.paket-fehler', { name: paket.name, grund: r.fehler }));
    const vonPaket = r.von ?? von;
    await kz.setze(ZWISCHENSPEICHER, schluessel, { text: r.text, von: vonPaket }, Date.now() + UEBERSETZUNG_TAGE * 86_400_000)
      .catch((e) => log.warn('Übersetzung nicht zwischengespeichert', { fehler: (e as Error).message }));
    return { ...basis, text: r.text, von: vonPaket };
  }

  /** Veraltete Übersetzungen einer Quelle löschen: Abschnitte, die es so nicht mehr gibt, und ältere Versionen des Pakets. */
  private async raeumeAuf(mappe: string, qt: string, gueltig: Set<string>, paket: { id: string; version: string }) {
    const kz = this.zustand();
    const p = praefix(mappe, qt);
    const alle = await kz.liste(ZWISCHENSPEICHER, p, 5000).catch(() => []);
    for (const e of alle) {
      const [hash, , pv] = e.schluessel.slice(p.length).split('|');
      const [pid, version] = (pv ?? '').split('@');
      if (!gueltig.has(hash) || (pid === paket.id && version !== paket.version)) await kz.loesche(ZWISCHENSPEICHER, e.schluessel).catch(() => 0);
    }
  }

  /** Übersetzungen einer Mappe (ganz) oder einer Quelle vergessen – nach Änderung oder Löschen. */
  async vergiss(mappe: string, quelle?: string) {
    await this.zustand().loesche(ZWISCHENSPEICHER, praefix(mappe, quelle), { praefix: true }).catch(() => 0);
  }

  /** Abnehmer im Ereigniskatalog (#670): Änderungen am Original lassen die Übersetzungen verfallen. */
  async nachEreignis(e: KatalogEreignis) {
    const mappe = typeof e.daten.mappe === 'string' ? e.daten.mappe : null;
    if (!mappe) return;
    if (e.art === 'mappe.geloescht' || e.art === 'mappe.endgueltig_geloescht') return this.vergiss(mappe);
    if (e.art === 'mappe.geaendert') {
      const felder = Array.isArray(e.daten.felder) ? e.daten.felder.map(String) : [];
      for (const f of felder) await this.vergiss(mappe, `feld:${f}`);
      return;
    }
    if (e.art === 'volltext.fertig' && typeof e.daten.dokument === 'string') return this.vergiss(mappe, `volltext:${e.daten.dokument}`);
  }
}

/** Antwort des Pakets: JSON `{ "text": "…", "von": "en" }` oder `{ "fehler": "…" }`. */
export function liesAntwort(roh: string): { text: string; von: string | null } | { fehler: string } {
  let j: unknown;
  try { j = JSON.parse(roh.trim()); } catch { return { fehler: t('meldungen.uebersetzung.kein-json') }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { fehler: t('meldungen.uebersetzung.kein-json') };
  const o = j as Record<string, unknown>;
  if (typeof o.fehler === 'string' && o.fehler.trim()) return { fehler: o.fehler.trim().slice(0, 300) };
  if (typeof o.text !== 'string') return { fehler: t('meldungen.uebersetzung.ohne-text') };
  const von = typeof o.von === 'string' && SPRACHKENNUNG_KURZ.test(o.von) ? o.von : null;
  return { text: o.text.replace(/\u0000/g, ''), von };
}
