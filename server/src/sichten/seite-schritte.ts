/**
 * Eine Seite einer Ansicht (#1278, Schritt 6b-3 aus sichten.dienst.ts): Parameter lesen, das Ziel der Seite bestimmen
 * (Ansicht, Typ, Verweisfeld, sprechender Link, erweiterte Suche) und daraus die Anfrage an das Repo bauen. Ohne Zugriff
 * auf Repo oder Dienst – was nachgeschlagen werden muss, kommt als Funktion herein.
 */
import { liesDirektlink } from '../../../shared/src/direktlink';
import { abfrageAus, liesSuche } from '../../../shared/src/erweitertesuche';
import { inAllgemeinerSuche, type Mappentyp, sortierbar, type Werte, zieleVon } from '../../../shared/src/model';
import { auswahlKlausel, filterFuer, klauselnFuer, setzeEigeneWerte, type Sicht, wirksameTypen } from '../../../shared/src/sichten';
import { istTeiltyp } from '../../../shared/src/teile';
import { Fachfehler } from '../grundlagen/fehler';
import type { SeitenAnfrage, SortierungIntern } from '../repo';
import { t } from '../sprache/sprache';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/**
 * Mappentypen der erweiterten Suche (#199): die gewählten – sonst alle, außer solchen mit „In der allgemeinen Suche
 * zeigen: nein“ (#1220, z. B. reine Auswahllisten). Teile (#1031) nie.
 */
export function suchTypen(gewaehlt: Mappentyp[], typen: Map<string, Mappentyp>): Mappentyp[] {
  return (gewaehlt.length ? gewaehlt : [...typen.values()].filter(inAllgemeinerSuche)).filter((t) => !istTeiltyp(t));
}

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel',
  _typ: 'typ',
  _erstellt: 'erstellt',
  _geaendert: 'geaendert',
  _erstelltVon: 'erstelltVon',
  _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art =
    f.typ === 'prozent'
      ? 'zahl'
      : f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'zeitraum' || f.typ === 'datum' || f.typ === 'janein'
        ? f.typ
        : 'text';
  return { art, key: f.key, absteigend };
}

/** Parameter einer Seite, wie sie aus der Anfrage kommen. */
export interface SeitenQuery {
  sicht?: string;
  link?: unknown;
  eigene?: unknown;
  von?: unknown;
  anzahl?: unknown;
  suche?: unknown;
  sortierung?: unknown;
  absteigend?: unknown;
  volltext?: unknown;
  notizen?: unknown;
  gesamt?: unknown;
}

/** Blatt, Größe (höchstens `grenze`) und Suche; auch im Volltext der Dokumente (#45) und in Notizen (#55). */
export function seitenParameter(q: SeitenQuery, grenze: number) {
  const von = Math.max(0, Math.floor(Number(q.von) || 0));
  const anzahl = Math.min(grenze, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
  const suche = text(q.suche).slice(0, 200) || undefined;
  // Auch im Volltext der Dokumente (#45) und in Notizen (#55) suchen.
  const volltext = q.volltext === true || q.volltext === 'true' || undefined;
  const notizen = q.notizen === true || q.notizen === 'true' || undefined;
  return { von, anzahl, suche, volltext, notizen };
}
export type SeitenParameter = ReturnType<typeof seitenParameter>;

/**
 * „feld:<typId>:<feldKey>“ (#172): Auswahl für ein Referenzfeld – Zieltypen (#1036: einer oder mehrere) mit dem
 * Auswahlfilter des Felds. Nur Typen, die der Zugriff kennt; lesbar sind wie immer nur die Mappen, die die Person sieht.
 */
function auswahlAus(q: SeitenQuery, typen: Map<string, Mappentyp>) {
  const [, typId, key] = String(q.sicht).split(':');
  const f = typen.get(typId)?.felder.find((x) => x.key === key && x.typ === 'referenz');
  const ziele = f
    ? zieleVon(f)
        .map((id) => typen.get(id))
        .filter((x): x is Mappentyp => !!x)
    : [];
  if (!f || !ziele.length) throw new Fachfehler(404, t('meldungen.dienst.dieses-verweisfeld-gibt-es'));
  // Werte der Mappe, die gerade ausgefüllt wird (#173).
  let eigene: Werte = {};
  try {
    const w = JSON.parse(text(q.eigene).slice(0, 8000) || '{}');
    if (w && typeof w === 'object' && !Array.isArray(w)) eigene = w;
  } catch {
    /* ohne */
  }
  return { f, ziele, eigene };
}

/**
 * Was die Seite zeigt: eine verwaltete Ansicht (#38), „typ:<id>“ (alle Mappen eines Typs, ohne Bedingungen einer Ansicht,
 * z. B. Auswahl eines Verweises), ein Verweisfeld (#172), einen sprechenden Link (#98) oder die erweiterte Suche (#199) –
 * dazu der eine Mappentyp (Sortieren nach Feldern) und die Sortierung.
 */
export function seitenZiel(q: SeitenQuery, typen: Map<string, Mappentyp>, sichten: Sicht[], verborgeneSichten: () => Set<string>) {
  const nurTyp = String(q.sicht ?? '').startsWith('typ:') ? String(q.sicht).slice(4) : null;
  const auswahl = String(q.sicht ?? '').startsWith('feld:') ? auswahlAus(q, typen) : null;
  // Verborgene Sichten (#148) gibt es für den Benutzer nicht; ihre Mappen fehlen auch in der Elternsicht.
  const verborgen = verborgeneSichten();
  const sicht = nurTyp ? undefined : sichten.find((x) => x.id === q.sicht && !verborgen.has(x.id));
  // Sprechender Link (#98): „link“ mit den Parametern des Links in `link`.
  const gelesen = q.sicht === 'link' ? liesDirektlink(new URLSearchParams(text(q.link).slice(0, 4000)), [...typen.values()]) : null;
  if (gelesen && !gelesen.ok) throw new Fachfehler(422, gelesen.fehler.join(' '));
  const link = gelesen?.ok ? gelesen.link : null;
  // Erweiterte Suche (#199): „suche“ mit den Parametern der Suche in `link`; Rechte wie bei Sichten über `lesen`.
  const erweitert =
    q.sicht === 'suche' ? abfrageAus(liesSuche(new URLSearchParams(text(q.link).slice(0, 8000))), [...typen.values()]) : null;
  if (erweitert?.fehler.length) throw new Fachfehler(422, erweitert.fehler.join(' '));
  const einTyp = einTypAus(q, { nurTyp, sicht, link, erweitert }, typen, sichten);
  const sortierung =
    link && !text(q.sortierung)
      ? link.sortierung
        ? sortierungAus(link.sortierung.spalte, link.sortierung.absteigend, einTyp)
        : undefined
      : sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, einTyp);
  return { nurTyp, auswahl, verborgen, sicht, link, erweitert, sortierung };
}
export type SeitenZiel = ReturnType<typeof seitenZiel>;

/** Sortieren nach Feldern geht, wenn die Sicht genau einen Mappentyp zeigt. */
function einTypAus(
  q: SeitenQuery,
  ziel: Pick<SeitenZiel, 'nurTyp' | 'sicht' | 'link' | 'erweitert'>,
  typen: Map<string, Mappentyp>,
  sichten: Sicht[],
): Mappentyp | undefined {
  const { nurTyp, sicht, link, erweitert } = ziel;
  const fest = q.sicht === 'eingang' || q.sicht === 'favoriten';
  return erweitert
    ? erweitert.typen.length === 1
      ? erweitert.typen[0]
      : undefined
    : link
      ? link.typ
      : fest
        ? undefined
        : sicht
          ? (() => {
              const w = wirksameTypen(sichten, sicht.id, typen.keys());
              return w.length === 1 ? typen.get(w[0]) : undefined;
            })()
          : typen.get(nurTyp ?? String(q.sicht));
}

type Aufloesung = Parameters<typeof filterFuer>[2];

/**
 * Die Anfrage an das Repo: Eingang, Favoriten, erweiterte Suche, Link, Auswahl eines Verweisfelds, Ansicht oder ein
 * Typ. Rollen und heute (Auflösung) bzw. ob die Person Aufgaben ohne Empfänger sieht, nur für das, was sie braucht.
 */
export async function seitenAnfrage(
  q: SeitenQuery,
  ziel: SeitenZiel,
  p: SeitenParameter & { lesen: SeitenAnfrage['lesen']; sortierung: SeitenZiel['sortierung'] },
  quellen: {
    ich: { id: string };
    typen: Map<string, Mappentyp>;
    sichten: Sicht[];
    aufloesung: () => Promise<Aufloesung>;
    siehtOhneEmpfaenger: () => Promise<boolean>;
  },
): Promise<SeitenAnfrage> {
  const { suche, volltext, notizen, von, anzahl, sortierung, lesen } = p;
  const { ich, typen, sichten, aufloesung } = quellen;
  const { erweitert, link, auswahl, sicht, nurTyp, verborgen } = ziel;
  const rest = { suche, volltext, notizen, von, anzahl, sortierung, lesen };
  if (q.sicht === 'eingang')
    return {
      eingang: { benutzerId: ich.id, admin: await quellen.siehtOhneEmpfaenger() },
      suche,
      volltext,
      notizen,
      von,
      anzahl,
      sortierung,
      lesen: suche ? lesen : null,
    };
  if (q.sicht === 'favoriten') return { favoriten: { benutzerId: ich.id }, ...rest };
  if (erweitert)
    return {
      // Teile (#1031) nie in der erweiterten Suche – nur an ihrer übergeordneten Mappe. Ohne gewählten Typ (Suchfeld
      // oben) auch nicht Typen mit „In der allgemeinen Suche zeigen: nein“ (#1220).
      klauseln: [
        {
          typen: suchTypen(erweitert.typen, typen).map((t) => t.id),
          filter: filterFuer(erweitert, erweitert.typen, await aufloesung()),
        },
      ],
      textfilter: erweitert.volltext ?? undefined,
      ...rest,
    };
  if (link) return { klauseln: [{ typen: [link.typ.id], filter: filterFuer(link, [link.typ], await aufloesung()) }], ...rest };
  if (auswahl)
    return {
      klauseln: [auswahlKlausel(setzeEigeneWerte(auswahl.f.auswahlFilter ?? [], auswahl.eigene), auswahl.ziele, await aufloesung())],
      ...rest,
    };
  if (sicht) return { klauseln: klauselnFuer(sichten, sicht.id, typen, await aufloesung(), verborgen), ...rest };
  return { typId: nurTyp ?? q.sicht, ...rest };
}

/** Beim Blättern ohne Suche (#740): die Zahl vom ersten Blatt statt noch einmal zu zählen. */
export function bekanntesGesamt(q: SeitenQuery, p: SeitenParameter, textfilter: unknown): number | undefined {
  const bekannt = Number(q.gesamt);
  return p.von > 0 && !p.suche && !textfilter && Number.isInteger(bekannt) && bekannt >= 0 ? bekannt : undefined;
}
