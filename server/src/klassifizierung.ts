/**
 * Klassifizieren (#939): „Wohin gehört das?“ auf der Seite „Dokument übernehmen“ (#934) – mehrstufig.
 *
 * Wege (siehe shared/src/klassifizierung.ts):
 * - Pakete mit `dms:klassifizieren`: ein Sprachmodell (Paket mit Netz – nur, wenn der Administrator es als Standard für
 *   „Aus Dokument ausfüllen“ gewählt und den Datenabfluss bestätigt hat) und die Ähnlichkeit (Paket ohne Netz, das auch
 *   `dms:vektoren` hat). Sie bekommen den Anfang des Dokuments und die Kandidaten – nie Mappen. Die Ähnlichkeit bekommt
 *   dazu die Typen der ähnlichsten Dokumente, die die Person und das Paket lesen dürfen (nur Typ und Maß).
 * - Kern-Erkennung: der Name eines Typs als Überschrift im Text (#934).
 * - Abgleich über „Zum Wiederfinden nutzen“ (#938): wiedergefundene Mappen stärken Typen, deren Verweisfelder auf sie zeigen.
 *
 * Kandidaten für Pakete: Typen mit „Kann aus Post angelegt werden“, in denen die Person anlegen darf (#937) – und die für
 * KI-Dienste zugelassen sind (#796), für jedes Paket. Ist ein Quelldokument aus einem nicht zugelassenen Typ, geht an kein
 * Paket etwas – auch nicht an eines ohne Netz. Jede Antwort wird streng geprüft (Schema, nur angebotene Typen, Zitat im Dokument); Ungültiges
 * fällt mit Hinweis weg. Es wird nichts gespeichert und nichts geschrieben: Das Ergebnis ist ein Vorschlag.
 * Netzaufrufe der Pakete protokolliert der Paket-Läufer (#807).
 */
import { typAusText } from '../../shared/src/erkennung';
import {
  KANDIDATEN_MAX, KLASSIFIZIEREN_HINWEIS, KLASSIFIZIEREN_TEXT_MAX, klassifizierSchema, kurzText, pruefeKlassifizierung, verbindeWege,
  type Kandidat, type Klassbeleg, type Klassifizierung as Ergebnis, type Wegstand,
} from '../../shared/src/klassifizierung';
import type { MappenBezug, Mappentyp } from '../../shared/src/model';
import type { Dienst, Zugriff } from './dienst';
import type { Erkennung } from './erkennung';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Repo } from './repo';
import { t } from './sprache';

const log = protokoll.modul('ablage');

/** Wer per Paket klassifiziert: geladene Pakete mit dms:klassifizieren (Paket-Läufer, auch über den Verbund). */
export interface KlassifizierAnbieter {
  pakete(): Array<{ id: string; name: string; netz: boolean; vektoren: boolean }>;
  klassifiziere(paket: string, eingang: Record<string, unknown>, ms: number): Promise<{ text: string; ms: number }>;
}

/** Zeitgrenze je Paket (ms); danach gelten die übrigen Wege. */
export const KLASSIFIZIEREN_MS = 45_000;
/** Zeitgrenze für den Vektor des Texts (Ähnlichkeit). */
export const AEHNLICH_MS = 5_000;
/** Höchstens so viele ähnliche Mappen zählen. */
export const AEHNLICHE_MAX = 10;
/** Ab dieser verbundenen Sicherheit wird ein Typ vorgeschlagen (die Überschrift im Text allein reicht). */
export const VORSCHLAG_AB = 0.3;
/** Gewicht der Kern-Erkennung (Name des Typs als Überschrift). */
export const KERN_SICHERHEIT = 0.6;
/** Gewicht des Abgleichs (starkes Merkmal bzw. nur schwache), geteilt durch die Zahl der Kandidaten mit passendem Verweis. */
export const ABGLEICH_STARK = 0.45;
export const ABGLEICH_SCHWACH = 0.2;
/** Höchstens so viele Dokumente (wie beim Abgleich). */
const DOKS_MAX = 10;

export class Klassifizierung {
  constructor(private d: Dienst, private erkennung: Erkennung, private repo: () => Repo) {}

  /** Wird gesetzt, sobald der Paket-Läufer läuft (verwaltung.ts bzw. fern.ts). */
  anbieter?: KlassifizierAnbieter;

  /**
   * Klassifizieren für Dokumente (höchstens 10, Lesen nötig): alle Wege, verbunden zu einem Vorschlag mit Belegen.
   * Antwortet ein Paket nicht oder unbrauchbar, gelten die übrigen Wege (mit Hinweis in `wege`).
   */
  async klassifiziere(eingabe: unknown, z?: Zugriff): Promise<Ergebnis & { bezuege: Record<string, MappenBezug> }> {
    const e = (eingabe ?? {}) as { dokumente?: unknown };
    const ids = [...new Set((Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string'))].slice(0, DOKS_MAX);
    if (!ids.length) throw new Fachfehler(422, t('meldungen.klassifizierung.keine-dokumente'));
    const teile: string[] = [];
    const ohneText: string[] = [];
    const quellTypen = new Set<string>();
    for (const id of ids) {
      const dok = await this.repo().holeDokument(id);
      if (!dok) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      quellTypen.add((await this.d.pruefeRecht(z, dok.mappeId, 'R')).typId);
      const text = await this.repo().volltext(id);
      if (text?.trim()) teile.push(text); else ohneText.push(id);
    }
    const text = teile.join('\n\n');
    const ziele = await this.d.ausPostZiele(z);
    const name = (id: string) => ziele.find((x) => x.id === id)?.name ?? '';
    if (!text.trim() || !ziele.length) return { vorschlag: null, typen: [], wege: [], ohneText, bezuege: {} };

    const start = Date.now();
    const [paketWege, abgleich] = await Promise.all([this.perPaketen(text, ziele, quellTypen, z), this.perAbgleich(text, ziele, z)]);
    const belege: Array<Klassbeleg & { typId: string }> = [...paketWege.belege, ...abgleich.belege];
    const kern = typAusText(text, ziele);
    if (kern) belege.push({ typId: kern.typId, weg: 'kern', sicherheit: KERN_SICHERHEIT, wort: kern.wort, fundstelle: kern.fundstelle });
    const wege: Wegstand[] = [...paketWege.wege, { weg: 'kern', stand: kern ? 'ok' : 'leer' }, { weg: 'abgleich', stand: abgleich.belege.length ? 'ok' : 'leer' }];
    const typen = verbindeWege(belege, name);
    const vorschlag = typen[0] && typen[0].sicherheit >= VORSCHLAG_AB ? typen[0] : null;
    const bezuege = Object.fromEntries(Object.entries(abgleich.bezuege).filter(([id]) => typen.some((x) => x.belege.some((b) => b.mappeId === id))));
    log.info('Klassifizieren', {
      zeichen: text.length, kandidaten: ziele.length, wege: wege.map((w) => `${w.paket?.id ?? w.weg}:${w.stand}`).join(', '),
      vorschlag: vorschlag ? name(vorschlag.typId) : '', sicherheit: vorschlag?.sicherheit ?? 0, ms: Date.now() - start,
    });
    return { vorschlag, typen, wege, ohneText, bezuege };
  }

  /**
   * Pakete mit dms:klassifizieren fragen (gleichzeitig, mit Zeitgrenze). Kandidaten nur aus zugelassenen Typen; Text nur
   * der Anfang. Ein Paket mit Netz nur, wenn es als Standard für „Aus Dokument ausfüllen“ gewählt und der Datenabfluss
   * bestätigt ist. Jedes Paket (mit oder ohne Netz) nur, wenn alle Quelldokumente aus zugelassenen Typen stammen.
   */
  private async perPaketen(text: string, ziele: Mappentyp[], quellTypen: Set<string>, z?: Zugriff): Promise<{ belege: Array<Klassbeleg & { typId: string }>; wege: Wegstand[] }> {
    const pakete = this.anbieter?.pakete() ?? [];
    if (!pakete.length) return { belege: [], wege: [] };
    const { zugelassen } = await this.d.kiTypen();
    // Kandidaten: auch für Pakete ohne Netz nur zugelassene Typen – keine Namen oder Felder gesperrter Typen gehen hinaus.
    const kandidaten: Kandidat[] = ziele.filter((x) => zugelassen.has(x.id)).slice(0, KANDIDATEN_MAX)
      .map((x) => ({ id: x.id, name: x.name, beschreibung: kurzText(x.beschreibung), erkennbarAn: kurzText(x.erkennbarAn) }));
    const ids = new Set(kandidaten.map((x) => x.id));
    const anfang = text.slice(0, KLASSIFIZIEREN_TEXT_MAX);
    const wahl = await this.erkennung.standard();
    const wege: Wegstand[] = [];
    const belege: Array<Klassbeleg & { typId: string }> = [];
    await Promise.all(pakete.map(async (p) => {
      const paket = { id: p.id, name: p.name };
      const weg = p.netz ? 'ki' as const : 'aehnlichkeit' as const;
      if (p.netz && !(wahl.paket === p.id && wahl.abfluss)) { wege.push({ weg, paket, stand: 'aus' }); return; }
      if (!kandidaten.length) { wege.push({ weg, paket, stand: 'gesperrt', hinweis: t('meldungen.klassifizierung.keine-zugelassenen', { name: p.name }) }); return; }
      // Quelle aus einem nicht zugelassenen Mappentyp: nichts an das Paket – für alle Pakete, auch ohne Netz (wie die Kandidaten).
      if ([...quellTypen].some((x) => !zugelassen.has(x))) {
        log.info('Klassifizieren nicht an Paket gegeben (Quelle nicht für KI-Dienste zugelassen)', { paket: p.id });
        wege.push({ weg, paket, stand: 'gesperrt', hinweis: t('meldungen.klassifizierung.quelle-gesperrt', { name: p.name }) });
        return;
      }
      const eingang: Record<string, unknown> = { typen: kandidaten, schema: klassifizierSchema([...ids]), text: anfang, hinweis: KLASSIFIZIEREN_HINWEIS, sprache: 'de' };
      // Ähnlichkeit: nur ein Paket ohne Netz, das selbst die Vektoren liefert – nur Typ und Maß, mit den Rechten beider.
      if (!p.netz && p.vektoren) eingang.aehnliche = await this.d.aehnlicheTypen(z, p.id, text, ids, AEHNLICHE_MAX, AEHNLICH_MS).catch(() => null) ?? [];
      try {
        const r = await this.anbieter!.klassifiziere(p.id, eingang, KLASSIFIZIEREN_MS);
        const roh = r.text.trim();
        const a = roh.indexOf('{'), b = roh.lastIndexOf('}');
        let j: unknown = null;
        try { j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null; } catch { j = null; }
        const g = pruefeKlassifizierung(j, ids, anfang);
        if (g.ungueltig || g.verworfen.length) log.warn('Antwort beim Klassifizieren verworfen', { paket: p.id, ungueltig: g.ungueltig ?? '', verworfen: g.verworfen.join('; ').slice(0, 500) });
        if (g.ungueltig || (!g.typen.length && g.verworfen.length)) {
          wege.push({ weg, paket, stand: 'leer', verworfen: g.verworfen.length || 1, hinweis: t('meldungen.klassifizierung.nichts-brauchbares', { name: p.name }) });
          return;
        }
        wege.push({ weg, paket, stand: g.typen.length ? 'ok' : 'leer', ...(g.verworfen.length ? { verworfen: g.verworfen.length } : {}) });
        for (const x of g.typen) belege.push({ typId: x.typ, weg, sicherheit: x.sicherheit, paket, ...(x.begruendung ? { begruendung: x.begruendung } : {}), ...(x.zitat ? { zitat: x.zitat } : {}) });
      } catch (x) {
        log.warn('Klassifizieren per Paket fehlgeschlagen', { paket: p.id, fehler: (x as Error).message.slice(0, 300) });
        wege.push({ weg, paket, stand: 'fehler', hinweis: t('meldungen.klassifizierung.nicht-geantwortet', { name: p.name }) });
      }
    }));
    wege.sort((a, b) => (a.paket?.id ?? '').localeCompare(b.paket?.id ?? ''));
    return { belege, wege };
  }

  /**
   * Abgleich (#938): Vorhandene Mappen, die sich im Text wiederfinden (nur lesbare), stärken jeden Kandidaten mit einem
   * Verweisfeld auf ihren Typ – geteilt durch die Zahl solcher Kandidaten (zeigen Rechnung und Vertrag beide auf
   * Organisation, unterscheidet die Organisation sie nicht).
   */
  private async perAbgleich(text: string, ziele: Mappentyp[], z?: Zugriff): Promise<{ belege: Array<Klassbeleg & { typId: string }>; bezuege: Record<string, MappenBezug> }> {
    const a = await this.erkennung.abgleich(text, undefined, z).catch(() => null);
    if (!a?.treffer.length) return { belege: [], bezuege: {} };
    const belege: Array<Klassbeleg & { typId: string }> = [];
    const treffer = a.treffer.filter((x) => !x.unsicher);
    for (const tr of treffer) {
      const zeigen = ziele.flatMap((zt) => zt.felder.filter((f) => f.typ === 'referenz' && f.zielTyp === tr.typId && zt.id !== tr.typId).slice(0, 1).map((f) => ({ zt, f })));
      if (!zeigen.length) continue;
      const stark = tr.belege.some((b) => b.stark);
      const merkmal = tr.belege.find((b) => b.stark) ?? tr.belege[0];
      for (const { zt, f } of zeigen) {
        belege.push({
          typId: zt.id, weg: 'abgleich', sicherheit: Math.round(((stark ? ABGLEICH_STARK : ABGLEICH_SCHWACH) / zeigen.length) * 100) / 100,
          mappeId: tr.mappeId, feld: f.label || f.key, ...(merkmal ? { merkmal: `${merkmal.feld} ${merkmal.wert}` } : {}),
        });
      }
    }
    return { belege, bezuege: a.bezuege };
  }
}
