/**
 * „Frag deine Ablage“ (#444), Seite des Servers. Ablauf je Frage:
 *  1. Das DMS sucht selbst passende Stellen – Volltext der Dokumente, Titel und Angaben der Mappen und, wenn ein
 *     Paket mit dms:vektoren da ist, ähnliche Dokumente –, immer nur mit den Rechten des Fragenden.
 *  2. Es schneidet wenige Ausschnitte heraus (Höchstmenge aus der Werkbank) – nie den ganzen Bestand.
 *  3. Frage, bisheriger Chat (vom Browser) und Ausschnitte gehen an das Paket mit dms:antworten im Paket-Läufer;
 *     nur dieses Paket darf ins Netz, und nur zu seiner bestätigten Dienst-Adresse.
 *  4. Die Antwort ist nur Text; genannte Quellen prüft das DMS (nur gegebene, lesbare Mappen).
 * Gespeichert wird nichts davon; im Protokoll steht nur, dass gefragt wurde (Anzahl, Dauer), nie der Inhalt.
 */
import { auswahlText, type Feld, type Mappe, type Mappentyp } from '../../shared/src/model';
import { ausschnittUm, ausschnitteAlsText, AUSSCHNITT_MAX, FRAGE_MAX, FRAGEN_STANDARD, frageWoerter, KI_HINWEIS, liesAntwort, liesVerlauf, pruefeGrenzen, saeubere, type FrageAusschnitt, type FragenGrenzen, type FrageZeile } from '../../shared/src/fragen';
import type { Dienst, Zugriff } from './dienst';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Repo } from './repo';

const log = protokoll.modul('ablage');

/** Wer Fragen beantwortet: der Paket-Läufer (index.ts) mit dem Paket, das dms:antworten hat. */
export interface AntwortAnbieter {
  paket(): { id: string; name: string } | null;
  antworte(paket: string, eingang: Record<string, unknown>, teil: (text: string) => void): Promise<{ text: string; ms: number }>;
}

/** Gleichzeitig höchstens so viele Fragen (je Benutzer eine). */
const GLEICHZEITIG = 4;
/** So lange wartet die Suche höchstens auf den Vektor der Frage (ms); danach ohne Ähnlichkeit. */
const VEKTOR_MS = 3000;

export class FragenAnDieAblage {
  /** Wird gesetzt, sobald der Paket-Läufer läuft (index.ts). */
  anbieter?: AntwortAnbieter;
  private laufend = new Set<string>();

  constructor(private d: Dienst, private repo: () => Repo, private einst: () => Einstellungen | undefined) {}

  async grenzen(): Promise<FragenGrenzen> {
    const v = await this.einst()?.lies('fragen');
    if (!v) return { ...FRAGEN_STANDARD };
    const r = pruefeGrenzen(v);
    return r.grenzen;
  }
  async setzeGrenzen(e: unknown): Promise<FragenGrenzen> {
    const s = this.einst();
    if (!s) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    const r = pruefeGrenzen(e);
    if (Object.keys(r.fehler).length) throw new Fachfehler(422, 'Bitte die markierten Angaben prüfen.', { felderFehler: r.fehler, gruende: Object.values(r.fehler) });
    await s.schreibe('fragen', r.grenzen.ausschnitte === FRAGEN_STANDARD.ausschnitte && r.grenzen.zeichen === FRAGEN_STANDARD.zeichen ? null : r.grenzen);
    return this.grenzen();
  }

  /** Für die Oberfläche: Gibt es ein Antwort-Paket? (Sonst kein Eingabefeld.) */
  async stand(): Promise<{ verfuegbar: boolean; paket: string | null; grenzen: FragenGrenzen }> {
    const p = this.anbieter?.paket() ?? null;
    return { verfuegbar: !!p, paket: p?.name ?? null, grenzen: await this.grenzen() };
  }

  /**
   * Ausschnitte zu einer Frage – nur aus Mappen, die der Fragende lesen darf. Reihenfolge: abwechselnd beste
   * Dokumente, passende Mappen (Angaben) und ähnliche Dokumente; je Dokument und je Mappe (Angaben) einmal.
   */
  async ausschnitte(z: Zugriff | undefined, frage: string, vorher: string[], g: FragenGrenzen): Promise<FrageAusschnitt[]> {
    const woerter = frageWoerter([frage, ...vorher].join(' '));
    const typen = new Map((await this.repo().listeTypen()).map((t) => [t.id, t]));
    // Benutzer-Mappen gehen nie an ein Paket (wie bei Paketen allgemein).
    const erlaubt = (typId: string) => { const t = typen.get(typId); return !!t && t.system !== 'benutzer'; };
    const anzahl = g.ausschnitte;
    const f = await this.repo().fragenFundstellen({ woerter, lesen: z?.lesen ?? null, dokumente: anzahl * 2, mappen: anzahl });
    const aehnlich = await this.d.aehnlicheZuText(z, frage, anzahl * 2, VEKTOR_MS).catch(() => []);

    const je = Math.max(200, Math.min(AUSSCHNITT_MAX, Math.floor((g.zeichen / Math.max(1, anzahl)) * 1.5)));
    type Kandidat = { mappeId: string; quelle: FrageAusschnitt['quelle']; text: () => Promise<string> };
    const dok: Kandidat[] = f.dokumente.map((x) => ({ mappeId: x.mappeId, quelle: { art: 'dokument', id: x.id, name: x.name }, text: async () => ausschnittUm(x.text, woerter, je) }));
    const angaben: Kandidat[] = f.mappen.map((m) => ({ mappeId: m.id, quelle: { art: 'angaben' }, text: () => this.angabenText(z, m, typen.get(m.typId), je) }));
    const volltexte = await this.repo().volltexte(aehnlich.map((x) => x.dokumentId).filter((id) => !f.dokumente.some((d) => d.id === id)));
    const namen = new Map<string, string>();
    for (const x of aehnlich) if (volltexte.has(x.dokumentId)) namen.set(x.dokumentId, (await this.repo().holeDokument(x.dokumentId))?.name ?? '');
    const aehnl: Kandidat[] = aehnlich.filter((x) => volltexte.has(x.dokumentId))
      .map((x) => ({ mappeId: x.mappeId, quelle: { art: 'dokument', id: x.dokumentId, name: namen.get(x.dokumentId) ?? '' }, text: async () => ausschnittUm(volltexte.get(x.dokumentId)!, woerter, je) }));

    // Mappen, die vorkommen, auf einmal laden (Titel, Typ) und noch einmal auf Lesbarkeit prüfen.
    const alle = [...dok, ...angaben, ...aehnl];
    const bezuege = await this.repo().bezuege([...new Set(alle.map((x) => x.mappeId))]);
    const lesbar = await this.d.lesbare(z, [...bezuege.keys()]);
    const erg: FrageAusschnitt[] = [];
    const gesehen = new Set<string>();
    let zeichen = 0;
    const listen = [dok, angaben, aehnl];
    for (let i = 0; erg.length < anzahl && zeichen < g.zeichen && listen.some((l) => i < l.length); i++) {
      for (const l of listen) {
        const k = l[i];
        if (!k || erg.length >= anzahl || zeichen >= g.zeichen) continue;
        const b = bezuege.get(k.mappeId);
        const schluessel = k.quelle.art === 'dokument' ? `d:${k.quelle.id}` : `m:${k.mappeId}`;
        if (!b || !lesbar.has(k.mappeId) || !erlaubt(b.typId) || gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        let text = saeubere(await k.text());
        if (!text) continue;
        if (zeichen + text.length > g.zeichen) text = `${text.slice(0, Math.max(0, g.zeichen - zeichen)).trimEnd()} …`;
        zeichen += text.length;
        erg.push({ nr: erg.length + 1, mappe: { id: k.mappeId, typId: b.typId, titel: b.titel }, typ: typen.get(b.typId)?.name ?? '', quelle: k.quelle, text });
      }
    }
    return erg;
  }

  /** Angaben einer Mappe als Text: Feld: Wert – ohne Passwortfelder; Verweise mit dem Titel, wenn lesbar. */
  private async angabenText(z: Zugriff | undefined, m: Mappe, t: Mappentyp | undefined, max: number): Promise<string> {
    if (!t) return '';
    const zeilen: string[] = [];
    const ziele = t.felder.filter((f) => f.typ === 'referenz').flatMap((f) => (Array.isArray(m.werte[f.key]) ? m.werte[f.key] as string[] : typeof m.werte[f.key] === 'string' ? [m.werte[f.key] as string] : []));
    const lesbar = ziele.length ? await this.d.lesbare(z, ziele) : new Set<string>();
    const titel = ziele.length ? await this.repo().titelVon([...lesbar]) : new Map<string, string>();
    for (const f of t.felder) {
      const w = this.wertText(f, m.werte[f.key], (id) => (lesbar.has(id) ? titel.get(id) ?? null : null));
      if (w) zeilen.push(`${f.label}: ${w}`);
    }
    return ausschnittUm(zeilen.join('\n'), [], max);
  }

  private wertText(f: Feld, v: unknown, titel: (id: string) => string | null): string {
    if (v === null || v === undefined || v === '' || f.typ === 'passwort') return '';
    if (typeof v === 'string' && v.startsWith('dms1$')) return '';
    switch (f.typ) {
      case 'referenz': return (Array.isArray(v) ? v : [v]).map((id) => titel(String(id))).filter(Boolean).join(', ');
      case 'janein': return v === true ? 'ja' : v === false ? 'nein' : '';
      case 'betrag': { const b = v as { betrag?: unknown; waehrung?: unknown }; return typeof b?.betrag === 'number' ? `${b.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(b.waehrung ?? 'EUR')}` : ''; }
      case 'auswahl': return Array.isArray(v) ? v.map(String).join(', ') : auswahlText(v);
      default: return typeof v === 'object' ? '' : String(v).slice(0, 2000);
    }
  }

  /**
   * Eine Frage beantworten: Zeilen (NDJSON) an `schreibe` – zuerst die Ausschnitte, dann Teile der Antwort, zum
   * Schluss die Antwort mit geprüften Quellen oder ein Fehler. Wirft nur vor dem ersten Schreiben (Fachfehler).
   */
  async frage(z: Zugriff, eingabe: unknown, schreibe: (z: FrageZeile) => void): Promise<void> {
    const e = (eingabe ?? {}) as { frage?: unknown; verlauf?: unknown };
    const frage = typeof e.frage === 'string' ? saeubere(e.frage).slice(0, FRAGE_MAX) : '';
    if (!frage) throw new Fachfehler(422, 'Bitte eine Frage eingeben.');
    const paket = this.anbieter?.paket();
    if (!paket || !this.anbieter) throw new Fachfehler(409, 'Es ist kein Paket installiert, das Fragen beantwortet.');
    if (this.laufend.has(z.ich.id)) throw new Fachfehler(429, 'Deine vorige Frage läuft noch. Bitte warte die Antwort ab.');
    if (this.laufend.size >= GLEICHZEITIG) throw new Fachfehler(429, 'Gerade werden schon mehrere Fragen beantwortet. Bitte gleich noch einmal.');
    this.laufend.add(z.ich.id);
    const start = Date.now();
    let ausschnitte: FrageAusschnitt[] = [];
    let geschrieben = false;
    try {
      const verlauf = liesVerlauf(e.verlauf);
      const g = await this.grenzen();
      const vorige = verlauf.filter((v) => v.rolle === 'frage').slice(-1).map((v) => v.text);
      ausschnitte = await this.ausschnitte(z, frage, vorige, g);
      const mappen = new Set(ausschnitte.map((a) => a.mappe.id)).size;
      schreibe({ art: 'ausschnitte', ausschnitte, mappen });
      geschrieben = true;
      const r = await this.anbieter.antworte(paket.id, {
        frage, verlauf, hinweis: KI_HINWEIS, sprache: 'de',
        // Für das Paket: die Ausschnitte einzeln und – als Daten gekennzeichnet – fertig als Text.
        ausschnitte: ausschnitte.map((a) => ({ nr: a.nr, mappe: a.mappe.titel, typ: a.typ, quelle: a.quelle.art === 'dokument' ? a.quelle.name : 'Angaben der Mappe', text: a.text })),
        ausschnitte_text: ausschnitteAlsText(ausschnitte),
      }, (t) => schreibe({ art: 'teil', text: t }));
      const a = liesAntwort(r.text, ausschnitte.map((x) => x.nr));
      if (a.fehler) throw new Error(a.fehler);
      // Quellen: nur gegebene Ausschnitte, noch einmal auf Lesbarkeit geprüft (die Rechte können sich geändert haben).
      const jeMappe = new Map<string, number[]>();
      for (const n of a.quellen) { const x = ausschnitte.find((y) => y.nr === n)!; jeMappe.set(x.mappe.id, [...(jeMappe.get(x.mappe.id) ?? []), n]); }
      const ok = await this.d.lesbare(z, [...jeMappe.keys()]);
      const quellen = [...jeMappe].filter(([id]) => ok.has(id)).map(([id, nr]) => { const m = ausschnitte.find((y) => y.mappe.id === id)!.mappe; return { id, typId: m.typId, titel: m.titel, nr }; });
      schreibe({ art: 'fertig', text: a.text || 'Das Paket hat keine Antwort geliefert.', quellen, ms: Date.now() - start });
      log.info('Frage an die Ablage gestellt', { von: z.ich.id, paket: paket.id, ausschnitte: ausschnitte.length, mappen, quellen: quellen.length, ms: Date.now() - start });
    } catch (x) {
      if (!geschrieben) throw x;
      log.warn('Frage an die Ablage nicht beantwortet', { von: z.ich.id, paket: paket.id, ausschnitte: ausschnitte.length, ms: Date.now() - start, fehler: (x as Error).message.slice(0, 300) });
      schreibe({ art: 'fehler', text: `Keine Antwort: ${(x as Error).message}` });
    } finally {
      this.laufend.delete(z.ich.id);
    }
  }
}
