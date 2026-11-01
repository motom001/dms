/**
 * Baum-Sammlung über Verweise (#396, #424): Ausgehend von einer Mappe alle Mappen, die über Verweise
 * mit ihr verbunden sind – über mehrere Ebenen, mit Kreiserkennung, Obergrenze und nur innerhalb der
 * Rechte des Aufrufers. Einmal gebaut, genutzt von der Auskunft nach Art. 15 DSGVO (#396) und von
 * „Mappe mit allen verknüpften Mappen löschen“ (#424).
 *
 * Richtungen, von einer Mappe aus gesehen:
 *   verwiesenVon  Mappen, die auf sie verweisen (Vertragspartner ← Vertrag ← Rechnung) – „nach unten“
 *   verweistAuf   Mappen, auf die sie verweist (Mieter → Wohnung → Haus) – „nach oben“
 *
 * Ohne `seitwaerts` geht jeder Knoten nur in der Richtung weiter, über die er erreicht wurde; nur die
 * Start-Mappe geht in alle gewählten Richtungen. Sonst würde z. B. von einer Rechnung „nach oben“ auch
 * der Handwerker gesammelt und von dort alle seine anderen Rechnungen.
 *
 * Verweisart (Entscheidung Thomas zu #424, #472): Jedes Referenzfeld ist „Zugehörigkeit“ (die Rechnung
 * gehört zum Vertrag) oder „Bezug“ (nur verknüpft, z. B. Ansprechpartner, Für, Zugeordnet zu). Mit
 * `nurZugehoerigkeit` geht die Sammlung nur über Zugehörigkeit weiter: Eine Mappe, die nur über Bezug
 * verbunden ist, steht als Blatt im Baum (`nurBezug`) – über sie wird nicht weitergesammelt.
 */
import type { Verweisart } from './model';
import type { Rechte } from './rechte';

export type BaumRichtung = 'verwiesenVon' | 'verweistAuf';
export const BAUM_RICHTUNGEN: Record<BaumRichtung, string> = { verwiesenVon: 'Mappen, die darauf verweisen', verweistAuf: 'Mappen, auf die sie verweist' };

export const BAUM_TIEFE_MAX = 10;
/** Obergrenze der Knoten je Baum (Start-Mappe mitgezählt). */
export const BAUM_MAX = 5000;
/** Höchstens so viele Verweise nach außen je Knoten und Richtung werden einzeln genannt (gezählt werden alle). */
export const AUSSEN_MAX = 20;

export interface BaumOptionen {
  richtungen: BaumRichtung[];
  /** 1 = nur die direkten Nachbarn der Start-Mappe. */
  tiefe: number;
  /** Höchstens so viele Knoten; darüber ist der Baum `abgeschnitten`. */
  max: number;
  /** Auch quer weitergehen (siehe oben); Standard: nein. */
  seitwaerts: boolean;
  /** Mappen dieser Typen nicht aufnehmen (z. B. Benutzer und Rollen); sie zählen als „außerhalb“. */
  ohneTypen: string[];
  /**
   * Nur über Verweise der Art „Zugehörigkeit“ weitersammeln (#424, #472). Mappen, die nur über „Bezug“
   * verbunden sind, stehen als Blatt im Baum (`nurBezug`); über sie geht es nicht weiter. Standard: nein.
   */
  nurZugehoerigkeit: boolean;
}

export const BAUM_STANDARD: BaumOptionen = { richtungen: ['verwiesenVon', 'verweistAuf'], tiefe: 2, max: 1000, seitwaerts: false, ohneTypen: [], nurZugehoerigkeit: false };

/** Über welchen Verweis ein Knoten erreicht wurde: `vonId` ist der Knoten eine Ebene darüber. */
export interface BaumKante {
  vonId: string;
  richtung: BaumRichtung;
  /** Feld des Verweises (in der verweisenden Mappe) mit Bezeichnung. */
  feldKey: string;
  feld: string;
  /** Verweisart des Feldes (Zugehörigkeit oder Bezug, Standard Bezug). */
  verweisart: Verweisart;
}

/** Ein Verweis zu einer Mappe außerhalb des Baums. Nicht lesbare Mappen ohne Titel (`verborgen`). */
export interface AussenVerweis {
  mappeId: string | null;
  typId: string | null;
  titel: string;
  feldKey: string;
  feld: string;
  verborgen?: boolean;
}

export interface BaumKnoten {
  id: string;
  typId: string;
  /** Name des Mappentyps. */
  typ: string;
  titel: string;
  /** 0 = Start-Mappe. */
  ebene: number;
  /** null nur bei der Start-Mappe. */
  ueber: BaumKante | null;
  /** Weitere Wege zu diesem Knoten innerhalb des Baums (Kreise, mehrere Eltern). */
  auchUeber: BaumKante[];
  /**
   * Mit `nurZugehoerigkeit`: nur über Verweise der Art „Bezug“ mit dem Baum verbunden – Blatt, über das
   * nicht weitergesammelt wird (#424: nur den Verweis entfernen; #472: nur Kennung und Feldname).
   */
  nurBezug?: boolean;
  /** Anzahl (aktueller) Dokumente. */
  dokumente: number;
  /**
   * Verweise zu Mappen außerhalb des Baums (#424 „🔗 hängt auch an anderen Mappen“): `verweistAuf` = der
   * Knoten hängt zusätzlich an einer anderen Mappe; `verwiesenVon` = eine andere Mappe hängt an ihm.
   * Je Richtung höchstens AUSSEN_MAX einzeln; `anzahl` zählt alle.
   */
  aussen: { verweistAuf: AussenVerweis[]; verwiesenVon: AussenVerweis[]; anzahl: { verweistAuf: number; verwiesenVon: number } };
  /** Archivmodus (#212): aufbewahren bis (JJJJ-12-31) oder null. */
  aufbewahrenBis: string | null;
  /** Noch in der Aufbewahrungsfrist – darf nicht gelöscht werden (#424 „🔒“). */
  gesperrt: boolean;
  /** Wirksame Rechte des Aufrufers (#424 „⛔ kein Löschrecht“: !rechte.D). */
  rechte: Rechte;
}

export interface Baum {
  startId: string;
  optionen: BaumOptionen;
  /** Breitensuche: Start zuerst, dann Ebene für Ebene, innerhalb einer Ebene nach Typ und Titel. */
  knoten: BaumKnoten[];
  /** Obergrenze erreicht: Es gibt weitere Mappen, die fehlen. */
  abgeschnitten: boolean;
  /** Verweise, die auf einen schon gesammelten Knoten zurückführen (Kreise und mehrfache Wege). */
  kreise: number;
  /** Mappen, die über Verweise erreichbar wären, die der Aufrufer aber nicht lesen darf (weder aufgenommen noch weiterverfolgt). */
  verborgen: number;
  /** Ebene der Knoten, die wegen der Tiefe nicht weiterverfolgt wurden, haben noch Nachbarn. */
  tieferMoeglich: boolean;
}

const ganz = (v: unknown, std: number, min: number, max: number) => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : std;
};
const liste = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []).map(String).map((x) => x.trim()).filter(Boolean);

/** Eingabe (Body oder Query) → Optionen; Unbekanntes fällt weg, Zahlen werden begrenzt. */
export function bereinigeBaumOptionen(e: unknown, standard: BaumOptionen = BAUM_STANDARD): BaumOptionen {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const r = liste(o.richtungen).filter((x): x is BaumRichtung => x in BAUM_RICHTUNGEN);
  return {
    richtungen: o.richtungen === undefined ? [...standard.richtungen] : [...new Set(r)],
    tiefe: ganz(o.tiefe, standard.tiefe, 1, BAUM_TIEFE_MAX),
    max: ganz(o.max, standard.max, 1, BAUM_MAX),
    seitwaerts: o.seitwaerts === undefined ? standard.seitwaerts : o.seitwaerts === true || o.seitwaerts === 'true',
    ohneTypen: o.ohneTypen === undefined ? [...standard.ohneTypen] : [...new Set(liste(o.ohneTypen))],
    nurZugehoerigkeit: o.nurZugehoerigkeit === undefined ? standard.nurZugehoerigkeit : o.nurZugehoerigkeit === true || o.nurZugehoerigkeit === 'true',
  };
}

/** Verweisart eines Referenzfeldes; fehlt sie (ältere Felder, Systemfelder), gilt „Bezug“. */
export function verweisartVon(typ: { felder: Array<{ key: string; verweisart?: Verweisart }> } | undefined, feldKey: string): Verweisart {
  return typ?.felder.find((f) => f.key === feldKey)?.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug';
}

/** Kinder eines Knotens (über `ueber`), in der Reihenfolge des Baums – zum Zeichnen. */
export function kinderVon(b: Pick<Baum, 'knoten'>, id: string): BaumKnoten[] {
  return b.knoten.filter((k) => k.ueber?.vonId === id);
}

/** Hängt der Knoten noch an Mappen außerhalb des Baums? (#424: nur den Verweis entfernen statt löschen.) */
export const haengtAuchAnderswo = (k: Pick<BaumKnoten, 'aussen'>) => k.aussen.anzahl.verweistAuf > 0;
/** Hängen Mappen außerhalb des Baums an ihm? (Löschen würde dort einen Verweis kappen.) */
export const wirdAnderswoGebraucht = (k: Pick<BaumKnoten, 'aussen'>) => k.aussen.anzahl.verwiesenVon > 0;

/** Zusammenfassung, z. B. „12 Mappen, 34 Dokumente“. */
export function baumZahlen(b: Pick<Baum, 'knoten'>): { mappen: number; dokumente: number; gesperrt: number } {
  return { mappen: b.knoten.length, dokumente: b.knoten.reduce((s, k) => s + k.dokumente, 0), gesperrt: b.knoten.filter((k) => k.gesperrt).length };
}
