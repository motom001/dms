/**
 * Klassifizieren (#939): „Wohin gehört das?“ auf der Seite „Dokument übernehmen“ (#934) – mehrstufig.
 *
 * Wege (siehe shared/src/klassifizierung.ts):
 * - Pakete mit `dms:klassifizieren`: ein Sprachmodell (Paket mit Netz – nur, wenn der Administrator es als Standard für
 *   „Aus Dokument ausfüllen“ gewählt und den Datenabfluss bestätigt hat) und die Ähnlichkeit (Paket ohne Netz, das auch
 *   `dms:vektoren` hat). Sie bekommen den Anfang des Dokuments und die Kandidaten – nie Mappen. Die Ähnlichkeit bekommt
 *   dazu die Typen der ähnlichsten Dokumente, die die Person und das Paket lesen dürfen (nur Typ und Maß).
 * - Kern-Erkennung: der Name eines Typs als Überschrift im Text (#934) – auch Mehrzahl und gleichbedeutende Wörter (#1673).
 * - Abgleich über „Zum Wiederfinden nutzen“ (#938): wiedergefundene Mappen stärken Typen, deren Verweisfelder auf sie zeigen.
 * - Absender (#1680), „Woran man ihn erkennt“ (#1673) und Einträge von Auswahllisten (#1689), siehe klassifizierung-wege.ts.
 * Gegenanzeichen (#1672) senken danach die Sicherheit je Typ; ohne abgelegte Mappe ist ein Typ nie „sicher“ (#1673).
 *
 * Kandidaten für Pakete: Typen mit „Kann aus Post angelegt werden“, in denen die Person anlegen darf (#937). Für Pakete mit
 * Netz gilt dieselbe Sperre wie auf allen anderen Wegen (`kiSperre`, #796/#1635): nur Typen, die an Dienste im Netz gehen
 * dürfen, und nichts, wenn ein Quelldokument aus einem anderen Typ stammt. Lokale Pakete sperrt sie nie (#1635). Jede
 * Antwort wird streng geprüft (Schema, nur angebotene Typen, Zitat im Dokument); Ungültiges
 * fällt mit Hinweis weg. Es wird nichts gespeichert und nichts geschrieben: Das Ergebnis ist ein Vorschlag.
 * Netzaufrufe der Pakete protokolliert der Paket-Läufer (#807).
 */
import { merkmalsfelder, typAusText } from '../../../shared/src/erkennung';
import {
  aehnlichkeitJeTyp,
  daempfe,
  erkennbarImText,
  gegenanzeichen,
  KANDIDATEN_MAX,
  type Naehe,
  SCHWELLE_STANDARD,
  KLASSIFIZIEREN_HINWEIS,
  KLASSIFIZIEREN_TEXT_MAX,
  klassifizierSchema,
  kurzText,
  pruefeKlassifizierung,
  verbindeWege,
  type Kandidat,
  type Klassbeleg,
  type Klassifizierung as Ergebnis,
  type Typgrund,
  type Wegstand,
} from '../../../shared/src/klassifizierung';
import { ERKENNBAR_AN_MAX, zieleVon, type MappenBezug, type Mappentyp } from '../../../shared/src/model';
import type { ErkennungDienst } from './erkennung-basis';
import type { Zugriff } from '../kern';
import type { ErkennungPositionen } from './erkennung-positionen';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache/sprache';
import { ohneErkennung } from '../../../shared/src/anlagen';
import { namenVon, perAbsender, perAuswahl, perErkennbar, type Kurzform } from './klassifizierung-wege';
import type { Gelerntes } from './gelerntes';

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
/** Ab dieser verbundenen Sicherheit wird ein Typ vorgeschlagen (die Überschrift im Text allein reicht) – Vorgabe; seit #1645 einstellbar. */
export const VORSCHLAG_AB = SCHWELLE_STANDARD;
/** Gewicht der Kern-Erkennung (Name des Typs als Überschrift). */
export const KERN_SICHERHEIT = 0.6;
/** Gewicht des Abgleichs (starkes Merkmal bzw. nur schwache), geteilt durch die Zahl der Kandidaten mit passendem Verweis. */
export const ABGLEICH_STARK = 0.45;
export const ABGLEICH_SCHWACH = 0.2;
/** Höchstens so viele Dokumente (wie beim Abgleich). */
const DOKS_MAX = 10;

export class Klassifizierung {
  constructor(
    private d: ErkennungDienst,
    /** Nur Standard-Weg, Abgleich und Schwelle (#1278, Schritt 5b: statt der ganzen Klasse `Erkennung`). */
    private erkennung: Pick<ErkennungPositionen, 'standard' | 'abgleich' | 'schwelle'>,
    private repo: () => Repo,
    /** Aus Korrekturen gelernt (#1681). */
    private gelerntes?: Pick<Gelerntes, 'typBelege'>,
  ) {}

  /** Wird gesetzt, sobald der Paket-Läufer läuft (verwaltung.ts bzw. fern.ts). */
  anbieter?: KlassifizierAnbieter;

  /**
   * Klassifizieren für Dokumente (höchstens 10, Lesen nötig): alle Wege, verbunden zu einem Vorschlag mit Belegen.
   * Antwortet ein Paket nicht oder unbrauchbar, gelten die übrigen Wege (mit Hinweis in `wege`).
   */
  async klassifiziere(eingabe: unknown, z?: Zugriff): Promise<Ergebnis & { bezuege: Record<string, MappenBezug> }> {
    const e = (eingabe ?? {}) as { dokumente?: unknown };
    const ids = [...new Set((Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string'))].slice(
      0,
      DOKS_MAX,
    );
    if (!ids.length) throw new Fachfehler(422, t('meldungen.klassifizierung.keine-dokumente'));
    const teile: string[] = [];
    const ohneText: string[] = [];
    const quellTypen = new Set<string>();
    const mappen = new Set<string>();
    for (const id of ids) {
      const dok = await this.repo().holeDokument(id);
      if (!dok) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      quellTypen.add((await this.d.rechtepruefung.pruefeRecht(z, dok.mappeId, 'R')).typId);
      mappen.add(dok.mappeId);
      // Anlagen (#998): Klassifizieren und KI nutzen nur Hauptdokumente – AGB und Protokolle stören den Vorschlag; die
      // Original-E-Mail (#999) nie.
      if (ohneErkennung(dok)) continue;
      const text = await this.repo().volltext(id);
      if (text?.trim()) teile.push(text);
      else ohneText.push(id);
    }
    const text = teile.join('\n\n');
    const ziele = await this.d.mappentypen.ausPostZiele(z);
    const name = (id: string) => ziele.find((x) => x.id === id)?.name ?? '';
    if (!text.trim() || !ziele.length) return { vorschlag: null, typen: [], wege: [], ohneText, bezuege: {} };

    const start = Date.now();
    const leer = { belege: [], bezuege: {} };
    // Vor den Paketen: Die Einträge der Auswahllisten gehen in Kurzform mit den Kandidaten an ein Sprachmodell (#1689).
    const auswahl = await perAuswahl(this.d, this.repo(), text, ziele, z);
    const [paketWege, abgleich, absender, gruppen, gelernt] = await Promise.all([
      this.perPaketen(text, ziele, quellTypen, z, auswahl.kurz),
      this.perAbgleich(text, ziele, z),
      perAbsender(this.d, this.repo(), [...mappen], ziele, z).catch(() => leer),
      this.d.suche.gleichbedeutendeWoerter().catch(() => [] as string[][]),
      // Aus Korrekturen gelernt (#1681): ein starker Beleg je gelerntem Typ dieses Absenders.
      this.gelerntes?.typBelege([...mappen], ziele, z).catch(() => leer) ?? leer,
    ]);
    // Namen mit Mehrzahl und gleichbedeutenden Wörtern (#1673): „Police“ als Überschrift spricht für „Vertrag“.
    const namen = new Map(ziele.map((x) => [x.id, namenVon(x, gruppen)] as const));
    const erkennbar = perErkennbar(text, ziele);
    const belege: Array<Klassbeleg & { typId: string }> = [
      ...paketWege.belege,
      ...abgleich.belege,
      ...absender.belege,
      ...erkennbar,
      ...gelernt.belege,
      ...auswahl.belege,
    ];
    const kern = typAusText(text, [...namen.values()].flat());
    if (kern) belege.push({ typId: kern.typId, weg: 'kern', sicherheit: KERN_SICHERHEIT, wort: kern.wort, fundstelle: kern.fundstelle });
    const wege: Wegstand[] = [
      ...paketWege.wege,
      { weg: 'kern', stand: stand(kern) },
      { weg: 'abgleich', stand: stand(abgleich.belege.length) },
      { weg: 'absender', stand: stand(absender.belege.length) },
      { weg: 'erkennbar', stand: stand(erkennbar.length) },
      ...nurMitBelegen({ gelernt: gelernt.belege.length, auswahl: auswahl.belege.length }),
    ];
    const schwelle = await this.erkennung.schwelle();
    // Wie sicher ist Ablago? (#1645): je möglichem Typ, was fehlte – nur Kennungen und Zahlen, nichts davon ins Protokoll.
    const gruende = await this.gruende(text, ziele, { gefunden: abgleich.gefunden, naehe: paketWege.naehe, namen });
    const typen = verbindeWege(belege, name, gesenkt(gruende, schwelle));
    const vorschlag = typen[0] && typen[0].sicherheit >= schwelle ? typen[0] : null;
    const genutzt = (id: string) => typen.some((x) => x.belege.some((b) => b.mappeId === id));
    const bezuege = Object.fromEntries(
      Object.entries({ ...abgleich.bezuege, ...absender.bezuege, ...gelernt.bezuege, ...auswahl.bezuege }).filter(([id]) => genutzt(id)),
    );
    log.info('Klassifizieren', {
      zeichen: text.length,
      kandidaten: ziele.length,
      wege: wege.map((w) => `${w.paket?.id ?? w.weg}:${w.stand}`).join(', '),
      vorschlag: vorschlag ? name(vorschlag.typId) : '',
      sicherheit: vorschlag?.sicherheit ?? 0,
      ms: Date.now() - start,
    });
    return { vorschlag, typen, wege, ohneText, bezuege, schwelle, gruende };
  }

  /**
   * Was für oder gegen jeden möglichen Typ spricht (#1645): Name nicht als Überschrift, keine bekannte Mappe hinter einem
   * Verweisfeld (z. B. kein bekanntes Konto, gesucht über die IBAN), wie viel von „Woran man ihn erkennt“ im Dokument steht
   * und – mit einem Paket für Ähnlichkeit – zu wie vielen abgelegten Mappen das Dokument ähnlich ist.
   */
  private async gruende(
    text: string,
    ziele: Mappentyp[],
    o: {
      gefunden: ReadonlySet<string>;
      naehe: ReadonlyMap<string, Naehe>;
      namen: ReadonlyMap<string, Array<Pick<Mappentyp, 'id' | 'name'>>>;
    },
  ): Promise<Record<string, Typgrund[]>> {
    const alle = new Map((await this.repo().listeTypen()).map((x) => [x.id, x] as const));
    const erg: Record<string, Typgrund[]> = {};
    for (const zt of ziele) {
      const g: Typgrund[] = [];
      if (!typAusText(text, o.namen.get(zt.id) ?? [zt])) g.push({ art: 'ueberschrift-fehlt' });
      for (const f of zt.felder.filter((x) => x.typ === 'referenz' && !x.ausgeblendet)) {
        const ziel = zieleVon(f)
          .map((id) => alle.get(id))
          .find((x) => x && x.id !== zt.id && !x.system && merkmalsfelder(x).length);
        if (ziel && !o.gefunden.has(ziel.id))
          g.push({ art: 'merkmal-fehlt', feld: f.key, typId: ziel.id, ...(f.pflicht ? { pflicht: true } : {}) });
      }
      g.push(zt.erkennbarAn?.trim() ? { art: 'erkennbar', ...erkennbarImText(zt.erkennbarAn, text) } : { art: 'erkennbar-leer' });
      const n = o.naehe.get(zt.id);
      if (n) g.push({ art: 'aehnlich', anzahl: n.anzahl, sehr: n.sehr, beste: n.beste });
      // Noch keine Mappe dieses Typs (#1673): höchstens „wahrscheinlich“.
      if (!(await this.repo().zaehleMappen(zt.id))) g.push({ art: 'ohne-beispiele' });
      erg[zt.id] = g;
    }
    return erg;
  }

  /**
   * Pakete mit dms:klassifizieren fragen (gleichzeitig, mit Zeitgrenze). Text nur der Anfang. Ein Paket mit Netz nur, wenn
   * es als Standard für „Aus Dokument ausfüllen“ gewählt und der Datenabfluss bestätigt ist. Gesperrte Typen je Paket nach
   * der gemeinsamen Regel `kiSperre` (#1635): weder als Kandidat noch als Quelle – für lokale Pakete ist nichts gesperrt.
   */
  private async perPaketen(
    text: string,
    ziele: Mappentyp[],
    quellTypen: Set<string>,
    z?: Zugriff,
    /** Einträge der Auswahllisten je Kandidat in Kurzform (#1689); gesperrte Listen gehen wie gesperrte Typen nicht hinaus. */
    kurz?: ReadonlyMap<string, Kurzform[]>,
  ): Promise<{ belege: Array<Klassbeleg & { typId: string }>; wege: Wegstand[]; naehe: Map<string, Naehe> }> {
    let naehe = new Map<string, Naehe>();
    const pakete = this.anbieter?.pakete() ?? [];
    if (!pakete.length) return { belege: [], wege: [], naehe };
    const anfang = text.slice(0, KLASSIFIZIEREN_TEXT_MAX);
    const wahl = await this.erkennung.standard();
    const wege: Wegstand[] = [];
    const belege: Array<Klassbeleg & { typId: string }> = [];
    await Promise.all(
      pakete.map(async (p) => {
        const paket = { id: p.id, name: p.name };
        const weg = p.netz ? ('ki' as const) : ('aehnlichkeit' as const);
        if (p.netz && !(wahl.paket === p.id && wahl.abfluss)) {
          wege.push({ weg, paket, stand: 'aus' });
          return;
        }
        // Eine Regel für alle Wege (#1635): `kiSperre` – für Pakete ohne Netz nie gesperrt. Kandidaten nur aus nicht
        // gesperrten Typen – keine Namen oder Felder gesperrter Typen gehen hinaus.
        const gesperrt = await this.d.ki.kiSperreFuer(p.id);
        const kandidaten: Kandidat[] = ziele
          .filter((x) => !gesperrt(x.id))
          .slice(0, KANDIDATEN_MAX)
          .map((x) => alsKandidat(x, kurzFuer(kurz?.get(x.id), gesperrt)));
        const ids = new Set(kandidaten.map((x) => x.id));
        if (!kandidaten.length) {
          wege.push({ weg, paket, stand: 'gesperrt', hinweis: t('meldungen.klassifizierung.keine-zugelassenen', { name: p.name }) });
          return;
        }
        // Quelle aus einem für dieses Paket gesperrten Mappentyp: nichts an das Paket (wie die Kandidaten). Die Meldung
        // nennt den Mappentyp (#1635); die Oberfläche führt von dort zur Feinabstimmung.
        const quelle = [...quellTypen].find(gesperrt);
        if (quelle) {
          log.info('Klassifizieren nicht an Paket gegeben (Quelle nicht für KI-Dienste zugelassen)', { paket: p.id });
          const typ = (await this.repo().holeTyp(quelle))?.name ?? '';
          wege.push({ weg, paket, stand: 'gesperrt', hinweis: t('meldungen.klassifizierung.quelle-gesperrt', { name: p.name, typ }) });
          return;
        }
        const eingang: Record<string, unknown> = {
          typen: kandidaten,
          schema: klassifizierSchema([...ids]),
          text: anfang,
          hinweis: KLASSIFIZIEREN_HINWEIS,
          sprache: 'de',
        };
        // Ähnlichkeit: nur ein Paket ohne Netz, das selbst die Vektoren liefert – nur Typ und Maß, mit den Rechten beider.
        let deckel: ((typ: string, s: number) => number) | null = null;
        if (!p.netz && p.vektoren) {
          naehe = await this.aehnlichFuer(p.id, eingang, kandidaten, text, z);
          // Nähe je Typ (#1672): Obergrenze für den Beleg des Pakets.
          deckel = (typ, s) => Math.min(s, naehe.get(typ)?.wert ?? 0);
        }
        try {
          const r = await this.anbieter!.klassifiziere(p.id, eingang, KLASSIFIZIEREN_MS);
          const roh = r.text.trim();
          const a = roh.indexOf('{'),
            b = roh.lastIndexOf('}');
          let j: unknown = null;
          try {
            j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null;
          } catch {
            j = null;
          }
          const g = pruefeKlassifizierung(j, ids, anfang);
          if (g.ungueltig || g.verworfen.length)
            log.warn('Antwort beim Klassifizieren verworfen', {
              paket: p.id,
              ungueltig: g.ungueltig ?? '',
              verworfen: g.verworfen.join('; ').slice(0, 500),
            });
          if (g.ungueltig || (!g.typen.length && g.verworfen.length)) {
            wege.push({
              weg,
              paket,
              stand: 'leer',
              verworfen: g.verworfen.length || 1,
              hinweis: t('meldungen.klassifizierung.nichts-brauchbares', { name: p.name }),
            });
            return;
          }
          wege.push({
            weg,
            paket,
            stand: g.typen.length ? 'ok' : 'leer',
            ...(g.verworfen.length ? { verworfen: g.verworfen.length } : {}),
          });
          for (const x of g.typen)
            belege.push({
              typId: x.typ,
              weg,
              sicherheit: deckel ? deckel(x.typ, x.sicherheit) : x.sicherheit,
              paket,
              ...(x.begruendung ? { begruendung: x.begruendung } : {}),
              ...(x.zitat ? { zitat: x.zitat } : {}),
            });
        } catch (x) {
          log.warn('Klassifizieren per Paket fehlgeschlagen', { paket: p.id, fehler: (x as Error).message.slice(0, 300) });
          wege.push({ weg, paket, stand: 'fehler', hinweis: t('meldungen.klassifizierung.nicht-geantwortet', { name: p.name }) });
        }
      }),
    );
    wege.sort((a, b) => (a.paket?.id ?? '').localeCompare(b.paket?.id ?? ''));
    return { belege, wege, naehe };
  }

  /**
   * Ähnlichkeit für ein Paket mit Vektoren: die ähnlichsten Mappen (nur Typ und Maß) und die Typgrößen (#1682: wie viele
   * Mappen je Typ das Paket lesen darf – damit ein großer Typ nicht durch Menge gewinnt) in den Eingang; zurück die Nähe
   * je Typ (#1672) für „Wie sicher ist Ablago?“.
   */
  private async aehnlichFuer(
    paket: string,
    eingang: Record<string, unknown>,
    kandidaten: Kandidat[],
    text: string,
    z?: Zugriff,
  ): Promise<Map<string, Naehe>> {
    const ids = new Set(kandidaten.map((x) => x.id));
    const [liste, anzahl] = await Promise.all([
      this.d.suche.aehnlicheTypen(z, paket, text, ids, AEHNLICHE_MAX, AEHNLICH_MS).catch(() => null),
      this.d.suche.typAnzahlen(paket, ids).catch(() => ({}) as Record<string, number>),
    ]);
    eingang.aehnliche = liste ?? [];
    for (const k of kandidaten) k.anzahl = anzahl[k.id] ?? 0;
    return aehnlichkeitJeTyp(liste ?? []);
  }

  /**
   * Abgleich (#938): Vorhandene Mappen, die sich im Text wiederfinden (nur lesbare), stärken jeden Kandidaten mit einem
   * Verweisfeld auf ihren Typ – geteilt durch die Zahl solcher Kandidaten (zeigen Rechnung und Vertrag beide auf
   * Organisation, unterscheidet die Organisation sie nicht).
   */
  private async perAbgleich(
    text: string,
    ziele: Mappentyp[],
    z?: Zugriff,
  ): Promise<{ belege: Array<Klassbeleg & { typId: string }>; bezuege: Record<string, MappenBezug>; gefunden: Set<string> }> {
    const a = await this.erkennung.abgleich(text, undefined, z).catch(() => null);
    if (!a?.treffer.length) return { belege: [], bezuege: {}, gefunden: new Set() };
    const belege: Array<Klassbeleg & { typId: string }> = [];
    // Eigene Organisation und Haushalt (#1043) stehen auf fast jedem Dokument – kein Beleg für einen Mappentyp.
    const treffer = a.treffer.filter((x) => !x.unsicher && !a.eigene?.includes(x.mappeId));
    // Typen der wiedergefundenen Mappen (#1645): Was hier fehlt, nennt „Wie sicher ist Ablago?“.
    const gefunden = new Set(treffer.map((x) => x.typId));
    for (const tr of treffer) {
      const zeigen = ziele.flatMap((zt) =>
        zt.felder
          .filter((f) => f.typ === 'referenz' && zieleVon(f).includes(tr.typId) && zt.id !== tr.typId)
          .slice(0, 1)
          .map((f) => ({ zt, f })),
      );
      if (!zeigen.length) continue;
      const stark = tr.belege.some((b) => b.stark);
      const merkmal = tr.belege.find((b) => b.stark) ?? tr.belege[0];
      for (const { zt, f } of zeigen) {
        belege.push({
          typId: zt.id,
          weg: 'abgleich',
          sicherheit: Math.round(((stark ? ABGLEICH_STARK : ABGLEICH_SCHWACH) / zeigen.length) * 100) / 100,
          mappeId: tr.mappeId,
          feld: f.label || f.key,
          ...(merkmal ? { merkmal: `${merkmal.feld} ${merkmal.wert}` } : {}),
        });
      }
    }
    return { belege, bezuege: a.bezuege, gefunden };
  }
}

/**
 * Gegenanzeichen senken die Sicherheit (#1672); ohne abgelegte Mappe nie „sicher“ (#1673). Was gesenkt hat, steht als
 * Grund „gesenkt“ dabei.
 */
function gesenkt(gruende: Record<string, Typgrund[]>, schwelle: number) {
  return (typId: string, s: number) => {
    const g = gruende[typId] ?? [];
    const x = daempfe(
      s,
      g,
      schwelle,
      g.some((y) => y.art === 'ohne-beispiele'),
    );
    const gegen = gegenanzeichen(g).zahl;
    if (gegen && x < Math.round(s * 100) / 100) g.push({ art: 'gesenkt', gegen });
    return x;
  };
}

/** Wege, die nur mit Belegen erscheinen (Gelerntes #1681, Auswahllisten #1689) – ohne bleiben sie unsichtbar. */
const nurMitBelegen = (n: Partial<Record<'gelernt' | 'auswahl', number>>): Wegstand[] =>
  (['gelernt', 'auswahl'] as const).filter((w) => n[w]).map((weg) => ({ weg, stand: 'ok' as const }));

/** Stand eines eingebauten Wegs: etwas gefunden oder leer. */
const stand = (x: unknown): Wegstand['stand'] => (x ? 'ok' : 'leer');

/** Kurzform der Auswahllisten eines Kandidaten (#1689) ohne die für dieses Paket gesperrten Listen. */
const kurzFuer = (liste: readonly Kurzform[] | undefined, gesperrt: (typId: string) => boolean): string =>
  (liste ?? [])
    .filter((k) => !gesperrt(k.liste))
    .map((k) => k.text)
    .join(' · ');

/** Ein Typ als Kandidat für ein Paket – „Woran man ihn erkennt“ ganz, so wie gespeichert (#1652), nicht nur 200 Zeichen. */
function alsKandidat(x: Mappentyp, auswahl?: string): Kandidat {
  return {
    id: x.id,
    name: x.name,
    beschreibung: kurzText(x.beschreibung),
    erkennbarAn: kurzText(x.erkennbarAn, ERKENNBAR_AN_MAX),
    ...(auswahl ? { auswahl } : {}),
  };
}
