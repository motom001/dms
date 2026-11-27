/**
 * Angebote beim Ausfüllen (#1724): Ein Paket meldet unter `code.angebote` an, für welche Mappentypen und welches
 * Code-Muster es Daten holen kann (shared/src/angebote.ts). Steht ein passender Code auf dem Dokument (#1723), nennt
 * „Aus Dokument ausfüllen“ das Angebot; die Oberfläche zeigt dafür einen Knopf im vorhandenen Hinweis. Erst der Klick
 * ruft das Paket – als Paket-Aktion (#1039): Aufruf mit Antwort und Zeitgrenze, eingeschränkter Zugriff statt
 * Dienstkonto, Verlauf im Paket-Läufer, Netz nur zu den angemeldeten Adressen, ein Abruf je Person und Paket zugleich.
 * Die Antwort sind Vorschläge – gespeichert wird erst beim Übernehmen, mit dem Zugriff der Person.
 *
 * Regeln (wie bei den Aktionen im Menü „Mappe“):
 * - Angeboten wird nur mit passendem Code, installiertem, nicht angehaltenem und geladenem Paket, dem Recht
 *   „Bearbeiten“ (bzw. „Anlegen“ bei einer neuen Mappe) und Lesen am Dokument; ein Paket mit Netz nur an Mappentypen,
 *   die für Dienste im Netz zugelassen sind (#796). Bei jedem Abruf wird das alles neu geprüft.
 * - Den Code nimmt Ablago aus den gemerkten Codes des Dokuments, nie aus der Anfrage. Er steht nie im Protokoll.
 * - Kein Abruf im Hintergrund: keine Automatisierung, kein Stapel, kein Prüfstand; ein Abruf je Klick.
 * - Werte für Verweise kommen nie vom Paket; jeder Wert geht durch die Prüfung gegen die Feldart.
 */
import { type AngebotBeimAusfuellen, type AusfuellAngebot } from '../../../shared/src/angebote';
import { type CodeAngaben, passenderCode, type GelesenerCode } from '../../../shared/src/codes';
import { schemaFuer, type Vorschlaege } from '../../../shared/src/erkennung';
import type { AktionsDialog } from '../../../shared/src/paketaktionen';
import { typKennung } from '../../../shared/src/kennungen';
import { geschuetzteFelder, type Feld, type Mappe, type MappenBezug, type Mappentyp } from '../../../shared/src/model';
import { randomUUID } from 'node:crypto';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { Fachfehler } from '../grundlagen/fehler';
import { AKTION_KURZ_MAX, AKTION_LAUF_MS, AKTION_ZEIT_MS } from '../grundlagen/grenzen';
import type { Kern, Zugriff } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import { hashe, type Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { istUuid } from '../repo';
import type { ZugriffDienst } from '../zugriff';
import { pruefeAntworten, reinerText } from './dialog';
import { DIALOGE_MAX, type AktionsLaeufer, type Handelnde } from './paketaktionen.dienst';
import { liesAngebotsAntwort, loeseVerweise } from './angebote-ergebnis';

const log = protokoll.modul('werkbank');
/** Sperre im Kurzzustand: höchstens ein Abruf je Person und Paket zugleich (wie bei den Aktionen im Menü „Mappe“). */
const SPERRE = 'angebot-sperre';
/** Höchstens so viele Dokumente je Anfrage – wie bei „Aus Dokument ausfüllen“. */
const DOKUMENTE_MAX = 10;

/** Was die Angebote vom Dienst brauchen. */
export interface AngeboteAnschluss {
  /** Zugriff des Dienstkontos eines Pakets – null, wenn es keins hat. */
  paketZugriff(paketId: string): Promise<Zugriff | null>;
  /** KI-Dienste (#796): Ist dieser Mappentyp für das Paket gesperrt? */
  kiSperre(paketId: string): Promise<(typId: string) => boolean>;
  /** Gemerkte Codes der Dokumente (#1723), in ihrer Reihenfolge – ältere Dokumente liest Ablago dabei nach. */
  codes(dokIds: string[]): Promise<Array<GelesenerCode & { dokument: string }>>;
  kurzzustand(): Kurzzustand;
}

/** Eingabe beim Ausfüllen: die Dokumente und ggf. die Mappe, die bearbeitet wird. */
interface Eingabe {
  dokumente: string[];
  mappe?: string;
}
const liesEingabe = (e: unknown): Eingabe => {
  const o = (e ?? {}) as { dokumente?: unknown; mappe?: unknown };
  return {
    dokumente: (Array.isArray(o.dokumente) ? o.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, DOKUMENTE_MAX),
    ...(typeof o.mappe === 'string' && o.mappe ? { mappe: o.mappe } : {}),
  };
};

/** Anfrage zum Abrufen: das Angebot, das Dokument mit dem Code, ggf. die Mappe; ab dem zweiten Schritt Lauf und Antworten. */
export interface AbrufEingabe {
  paket: string;
  angebot: string;
  dokument: string;
  mappe?: string;
  lauf?: string;
  antworten?: unknown;
}
/** Antwort: ein Dialog des Pakets (mit Lauf) oder Vorschläge wie bei „Aus Dokument ausfüllen“. */
export type AbrufErgebnis =
  | { paket: { id: string; name: string }; lauf: string; schritt: number; dialog: AktionsDialog }
  | {
      paket: { id: string; name: string };
      vorschlaege: Vorschlaege;
      bezuege: Record<string, MappenBezug>;
      neu: Record<string, { typId: string; werte: Record<string, string | number>; fundstelle: string }>;
      hinweis?: string;
    };
/** Ein Lauf mit offenem Dialog im Kurzzustand: Person, Angebot, Dokument, Schritt, Dialog und Stand des Pakets. */
interface AngebotsLauf {
  id: string;
  personId: string;
  paket: string;
  angebot: string;
  typId: string;
  dokument: string;
  mappe?: string;
  schritt: number;
  dialog: AktionsDialog;
  stand: unknown;
}
const LAUF = 'angebot-lauf';

/** Ein Kandidat: Paket, Angebot und der passende Code (mit Dokument). */
interface Treffer {
  p: InstalliertesPaket;
  a: AusfuellAngebot;
  code: GelesenerCode & { dokument: string };
}

export class AusfuellAngebote {
  constructor(
    private readonly kern: Kern,
    private readonly rechte: ZugriffDienst,
    private readonly anschluss: AngeboteAnschluss,
    private readonly laeufer: () => AktionsLaeufer | undefined,
  ) {}

  private get repo() {
    return this.kern.repo;
  }

  /**
   * Angebote zu einem Ergebnis von „Aus Dokument ausfüllen“ – je Person, nie vorberechnet. Ohne Dokumente, ohne Recht
   * oder ohne passenden Code: keine. Fehler hier verhindern nie die Vorschläge selbst.
   */
  async fuer(z: Zugriff, typId: string, eingabe: unknown): Promise<AngebotBeimAusfuellen[]> {
    const e = liesEingabe(eingabe);
    if (!e.dokumente.length || !z.typen.has(typId)) return [];
    try {
      const typ = await this.darfAusfuellen(z, typId, e.mappe);
      return (await this.treffer(z, typ, e.dokumente)).map(({ p, a, code }) => ({
        paket: { id: p.id, name: p.name },
        schluessel: a.schluessel,
        text: a.text,
        ...(a.knopf ? { knopf: a.knopf } : {}),
        ...(a.beschriftungen ? { beschriftungen: a.beschriftungen } : {}),
        dokument: code.dokument,
      }));
    } catch {
      return [];
    }
  }

  /** Bearbeiten an der Mappe bzw. Anlegen im Typ (wie „Aus Dokument ausfüllen“); kein Systemtyp. */
  private async darfAusfuellen(z: Zugriff, typId: string, mappeId?: string): Promise<Mappentyp> {
    const typ = z.typen.get(typId);
    if (!typ || typ.system) throw new Fachfehler(404, t('meldungen.paketaktionen.angebot-fehlt'));
    if (mappeId) {
      const m = await this.rechte.pruefeRecht(z, mappeId, 'U');
      if (m.typId !== typ.id) throw new Fachfehler(422, t('meldungen.erkennung.die-mappe-hat-einen'));
      return typ;
    }
    const entwurf = { id: '', typId: typ.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as unknown as Mappe;
    if (!(await this.rechte.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.erkennung.mappen-dieses-typs-darfst'));
    return typ;
  }

  /**
   * Pakete mit passendem Angebot und Code: installiert, nicht angehalten, vom Läufer geladen, Mappentyp im Angebot,
   * Dokument lesbar, nicht durch die KI-Sperre ausgeschlossen. Je Angebot das erste Dokument mit passendem Code. Die
   * Codes liest Ablago erst, wenn ein Paket für diesen Mappentyp etwas anbietet.
   */
  private async treffer(z: Zugriff, typ: Mappentyp, dokIds: string[]): Promise<Treffer[]> {
    const kandidaten = await this.kandidaten(typ);
    if (!kandidaten.length) return [];
    const lesbar: string[] = [];
    const quellTypen = new Set<string>();
    for (const id of dokIds) {
      const d = await this.repo.holeDokument(id);
      if (!d) continue;
      quellTypen.add((await this.rechte.pruefeRecht(z, d.mappeId, 'R')).typId);
      lesbar.push(id);
    }
    const codes = await this.anschluss.codes(lesbar);
    const r: Treffer[] = [];
    for (const { p, a } of kandidaten) {
      // KI-Dienste (#796): auch die Mappe, in der das Dokument liegt (meist Post), muss für das Paket zugelassen sein.
      if ([...quellTypen].some(await this.anschluss.kiSperre(p.id))) continue;
      const code = this.passend(a.code, codes, lesbar);
      if (code) r.push({ p, a, code });
    }
    return r;
  }

  /** Angebote für diesen Mappentyp von Paketen, die laufen und an ihm nicht durch die KI-Sperre ausgeschlossen sind. */
  private async kandidaten(typ: Mappentyp): Promise<Array<{ p: InstalliertesPaket; a: AusfuellAngebot }>> {
    const alle = await this.repo.listePakete();
    const pakete = alle.filter((p) => !p.angehalten && p.laeufer?.angebote?.length && this.laeufer()?.geladen(p.id));
    if (!pakete.length) return [];
    const typen = await this.repo.listeTypen();
    const r: Array<{ p: InstalliertesPaket; a: AusfuellAngebot }> = [];
    for (const p of pakete) {
      if ((await this.anschluss.kiSperre(p.id))(typ.id)) continue;
      const aufloesen = await this.rechte.typverweise(p.id, alle, typen);
      for (const a of p.laeufer!.angebote!) if (aufloesen(a.mappentypen).has(typ.id)) r.push({ p, a });
    }
    return r;
  }

  /** Der passende Code: im ersten Dokument mit Treffer, darin die frühere Seite (wie bei Feldern, #1723). */
  private passend(c: CodeAngaben, codes: Array<GelesenerCode & { dokument: string }>, dokIds: string[]) {
    return (
      dokIds
        .map((id) =>
          passenderCode(
            c,
            codes.filter((x) => x.dokument === id),
          ),
        )
        .find(Boolean) ?? null
    );
  }

  /**
   * Abrufen nach Klick: alles neu prüfen, das Paket mit dem Code (und, wenn es Dokumente lesen darf, dem Dokument)
   * fragen. Antwortet es mit einem Dialog (höchstens {@link DIALOGE_MAX}, wie bei den Aktionen), merkt Ablago den Lauf;
   * der nächste Aufruf bringt `lauf` und `antworten`. Sonst kommen Vorschläge – Verweise löst Ablago selbst auf. Fehler
   * des Pakets als verständliche Meldung; die übrigen Vorschläge der Oberfläche bleiben davon unberührt.
   */
  async abrufen(h: Handelnde, typId: string, x: AbrufEingabe): Promise<AbrufErgebnis> {
    const lauf = x.lauf ? await this.eigenerLauf(h, typId, x) : null;
    const antworten = lauf ? this.antworten(lauf, x.antworten) : undefined;
    const typ = await this.darfAusfuellen(h.z, typId, x.mappe);
    const t1 = (await this.treffer(h.z, typ, [x.dokument])).find((y) => y.p.id === x.paket && y.a.schluessel === x.angebot);
    if (!t1) throw new Fachfehler(404, t('meldungen.paketaktionen.angebot-fehlt'));
    const paket = { id: t1.p.id, name: t1.p.name };
    const mappe = x.mappe ? await this.repo.holeMappe(x.mappe) : undefined;
    const fest = geschuetzteFelder(typ, mappe);
    const erlaubt = (f: Feld) => f.typ !== 'passwort' && !fest[f.key] && !f.berechnetVon;
    const id = lauf?.id ?? randomUUID();
    const schritt = (lauf?.schritt ?? 0) + 1;
    const text = await this.rufe(h, t1, typ, erlaubt, { kennung: id, schritt, ...(lauf ? { antworten, stand: lauf.stand } : {}) });
    const fundstelle = t('meldungen.paketaktionen.angebot-fundstelle', { paket: paket.name });
    const a = liesAngebotsAntwort(text, typ, erlaubt, paket, fundstelle);
    if (a.verworfen.length) log.warn('Angebot: Werte verworfen', { paket: paket.id, felder: a.verworfen.join('; ') });
    if (a.art === 'dialog') return this.dialog(h, { ...x, typId, id, schritt, dialog: a.dialog, stand: a.stand }, paket);
    if (lauf) await this.zustand().loesche(LAUF, hashe(lauf.id));
    const v = await loeseVerweise({ repo: this.repo, rechte: this.rechte, z: h.z }, typ, a.verweise, erlaubt, fundstelle);
    const vorschlaege = { ...a.vorschlaege, ...v.vorschlaege };
    const leer = !Object.keys(vorschlaege).length && !Object.keys(v.neu).length;
    return {
      paket,
      vorschlaege,
      bezuege: v.bezuege,
      neu: v.neu,
      ...(leer ? { hinweis: t('meldungen.paketaktionen.angebot-leer', { paket: paket.name }) } : {}),
    };
  }

  private zustand() {
    return this.anschluss.kurzzustand();
  }

  /** Ein Dialog des Pakets: höchstens DIALOGE_MAX je Lauf; der Lauf steht im Kurzzustand (für alle Prozesse gleich). */
  private async dialog(h: Handelnde, l: Omit<AngebotsLauf, 'personId'> & AbrufEingabe, paket: { id: string; name: string }) {
    if (l.schritt > DIALOGE_MAX) {
      await this.zustand().loesche(LAUF, hashe(l.id));
      throw new Fachfehler(502, t('meldungen.paketaktionen.zu-viele-schritte', { paket: paket.name, max: DIALOGE_MAX }));
    }
    const lauf: AngebotsLauf = {
      id: l.id,
      personId: h.ich.id,
      paket: l.paket,
      angebot: l.angebot,
      typId: l.typId,
      dokument: l.dokument,
      ...(l.mappe ? { mappe: l.mappe } : {}),
      schritt: l.schritt,
      dialog: l.dialog,
      stand: l.stand,
    };
    await this.zustand().setze(LAUF, hashe(lauf.id), lauf, Date.now() + AKTION_LAUF_MS);
    return { paket, lauf: lauf.id, schritt: lauf.schritt, dialog: lauf.dialog };
  }

  /** Der Lauf dieser Person zu genau diesem Angebot – sonst 404 wie abgelaufen. */
  private async eigenerLauf(h: Handelnde, typId: string, x: AbrufEingabe): Promise<AngebotsLauf> {
    const l = istUuid(x.lauf ?? '') ? ((await this.zustand().lies(LAUF, hashe(x.lauf!)))?.wert as AngebotsLauf | undefined) : undefined;
    const passt =
      l && l.personId === h.ich.id && l.paket === x.paket && l.angebot === x.angebot && l.typId === typId && l.dokument === x.dokument;
    if (!passt || (l.mappe ?? '') !== (x.mappe ?? '')) throw new Fachfehler(404, t('meldungen.paketaktionen.lauf-fehlt'));
    return l;
  }

  /** Antworten der Person auf den Dialog prüfen (wie bei den Aktionen); fehlt eine Pflichtangabe, 422. */
  private antworten(lauf: AngebotsLauf, roh: unknown): Record<string, unknown> {
    const { werte, fehler } = pruefeAntworten(lauf.dialog, roh);
    if (Object.keys(fehler).length) throw new Fachfehler(422, t('meldungen.paketaktionen.antworten-fehlen'), { felderFehler: fehler });
    return werte;
  }

  /** Der Aufruf beim Paket – mit Sperre je Person und Paket, Zeitgrenze und eingeschränktem Zugriff. */
  private async rufe(
    h: Handelnde,
    x: Treffer,
    typ: Mappentyp,
    erlaubt: (f: Feld) => boolean,
    lauf: { kennung: string; schritt: number; antworten?: Record<string, unknown>; stand?: unknown },
  ): Promise<string> {
    const laeufer = this.laeufer();
    const name = x.p.name;
    if (!laeufer?.geladen(x.p.id)) throw new Fachfehler(503, t('meldungen.paketaktionen.antwortet-nicht', { paket: name }));
    const sperre = `${h.ich.id}|${x.p.id}`;
    if (!(await this.zustand().belege(SPERRE, sperre, AKTION_ZEIT_MS + 15_000)))
      throw new Fachfehler(429, t('meldungen.paketaktionen.laeuft-schon', { paket: name }));
    try {
      const doks = await this.dokumentFuerPaket(x);
      const kennung = typKennung(typ.paket, typ.schluessel ?? '');
      const r = await laeufer.rufe(
        x.p.id,
        {
          aktion: 'dms:angebot',
          angebot: x.a.schluessel,
          typ: kennung,
          schema: schemaFuer(typ, erlaubt),
          code: { art: x.code.art, inhalt: x.code.inhalt, ...(x.code.seite ? { seite: x.code.seite } : {}) },
          ...(doks.dokument ? { dokument: doks.dokument } : {}),
          ...lauf,
        },
        {
          ms: AKTION_ZEIT_MS,
          zugang: { mappe: { typ: kennung }, dokumente: doks.zugang },
          bezeichnung: t('meldungen.paketaktionen.angebot-verlauf', { schluessel: x.a.schluessel, person: h.ich.name }),
        },
      );
      log.info('Angebot beim Ausfüllen abgerufen', {
        paket: x.p.id,
        angebot: x.a.schluessel,
        von: h.ich.id,
        schritt: lauf.schritt,
        ok: r.ok,
      });
      if (!r.ok) {
        const grund = reinerText(r.fehler ?? '', AKTION_KURZ_MAX);
        throw new Fachfehler(503, t('meldungen.paketaktionen.angebot-fehler', { paket: name, grund }), { grund });
      }
      return r.text;
    } finally {
      await this.zustand().loesche(SPERRE, sperre);
    }
  }

  /** Das Dokument nur, wenn das Paket Dokumente lesen darf und die Mappe des Dokuments lesen kann (Schnittmenge). */
  private async dokumentFuerPaket(
    x: Treffer,
  ): Promise<{ dokument?: { id: string; name: string; mime: string }; zugang: Record<string, string> }> {
    const d = await this.repo.holeDokument(x.code.dokument);
    const pz = await this.anschluss.paketZugriff(x.p.id);
    const m = d ? await this.repo.holeMappe(d.mappeId) : undefined;
    if (!d || !m || !pz?.paket || pz.paket.dokumente === 'keine' || !(await this.rechte.rechteAn(pz, m)).R) return { zugang: {} };
    return { dokument: { id: d.id, name: d.name, mime: d.mime }, zugang: { [d.id]: d.sha256 } };
  }
}
