/**
 * Mappe mit allen verknüpften Mappen löschen (#424) – Vorschau und Plan, für Server und Oberfläche.
 *
 * Grundlage ist die Baum-Sammlung (#396, shared/src/baum.ts), nur „nach unten“: Mappen, die auf die
 * Start-Mappe verweisen (Vertragspartner ← Vertrag ← Rechnung …) – nie nach oben oder seitwärts, jede
 * Mappe nur einmal (Kreise). Mitgelöscht und weitergesammelt wird nur über Verweise der Art
 * „Zugehörigkeit“ (Entscheidung Thomas, 01.11.2026). Je Mappe eine Kennzeichnung:
 *   ✅ loeschen   wird gelöscht
 *   📎 bezug      hängt nur über einen Verweis der Art „Bezug“ dran (z. B. Ansprechpartner, Für) → nur
 *                 der Verweis wird entfernt, die Mappe bleibt; über sie wird nicht weitergesammelt
 *   🔗 geteilt    hängt auch an einer Mappe außerhalb (gleicher Typ oder gleiches Feld wie im Baum,
 *                 z. B. die Rechnung verweist zusätzlich auf einen anderen Vertrag) → Vorschlag: nur den
 *                 Verweis entfernen, Mappe behalten
 *   🔒 gesperrt   Aufbewahrungsfrist (#212) noch nicht abgelaufen → wird nie gelöscht
 *   ⛔ ohneRecht  kein Löschrecht (oder ein Typ, der sich nicht löschen lässt) → wird nie gelöscht
 *
 * Der Plan (`planeLoeschung`) rechnet aus der Auswahl, was wirklich geschieht: Eine Mappe, auf die
 * eine bleibende Mappe noch verweist, bleibt ebenfalls – Verweise werden nur bei „nur Verweis
 * entfernen“ gekappt, nie bei gesperrten Mappen. So bleiben z. B. Rechnungen in der
 * Aufbewahrungsfrist samt dem Vertrag und Vertragspartner, auf die sie verweisen.
 */
import { datumText } from './archiv';
import type { Baum, BaumKnoten } from './baum';

export type LoeschAktion = 'loeschen' | 'entkoppeln' | 'behalten';
export const LOESCH_AKTIONEN: Record<LoeschAktion, string> = { loeschen: 'löschen', entkoppeln: 'nur Verweis entfernen, Mappe behalten', behalten: 'behalten' };
export type LoeschKennzeichen = 'loeschen' | 'bezug' | 'geteilt' | 'gesperrt' | 'ohneRecht';
/** `symbol`: Name in web/src/Symbol.tsx (#425: einfarbige Symbole statt bunter Emoji). */
export const KENNZEICHEN: Record<LoeschKennzeichen, { symbol: 'geloescht' | 'link' | 'schloss' | 'verboten' | 'bezug'; text: string }> = {
  loeschen: { symbol: 'geloescht', text: 'wird gelöscht' },
  bezug: { symbol: 'bezug', text: 'nur über Bezug verbunden' },
  geteilt: { symbol: 'link', text: 'hängt auch an anderen Mappen' },
  gesperrt: { symbol: 'schloss', text: 'Aufbewahrungsfrist läuft noch' },
  ohneRecht: { symbol: 'verboten', text: 'kein Löschrecht' },
};
/** Standard-Tiefe der Vorschau (Ebenen unter der Start-Mappe). */
export const LOESCH_TIEFE = 5;

export interface LoeschKante { quelleId: string; feldKey: string; zielId: string }

export interface LoeschVorschau {
  /** Baum nur „nach unten“ (verwiesenVon), ohne Benutzer und Rollen, nur über Zugehörigkeit weiter (`nurBezug` = Blatt). */
  baum: Baum;
  /** Alle Verweise zwischen Mappen des Baums (nicht nur die Wege, über die der Baum gewachsen ist). */
  kanten: LoeschKante[];
  /** Mappen mit 🔗: hängen auch an Mappen außerhalb (gleicher Typ oder gleiches Feld wie im Baum). */
  geteilt: string[];
  /** Mappen, die sich grundsätzlich nicht löschen lassen (z. B. Systemrolle), mit Grund – zählen als ⛔. */
  nichtLoeschbar: Record<string, string>;
  /** Vorschlag je Mappe (Vorgabe der Kästchen); lässt sich unverändert an „Ausführen“ geben. */
  vorschlag: Record<string, LoeschAktion>;
  /** 0 = kein Papierkorb: Löschen ist sofort endgültig. */
  papierkorbTage: number;
}

type Quelle = Pick<LoeschVorschau, 'baum' | 'kanten' | 'geteilt' | 'nichtLoeschbar'>;

export function kennzeichen(v: Pick<LoeschVorschau, 'geteilt' | 'nichtLoeschbar'>, k: BaumKnoten): LoeschKennzeichen {
  if (k.gesperrt) return 'gesperrt';
  if (k.nurBezug) return 'bezug';
  if (!k.rechte.D || v.nichtLoeschbar[k.id]) return 'ohneRecht';
  if (v.geteilt.includes(k.id)) return 'geteilt';
  return 'loeschen';
}

/** Vorgabe: alles an; 📎 und 🔗 nur Verweis entfernen (wenn bearbeiten erlaubt); 🔒 und ⛔ behalten. */
export function loeschVorschlag(v: Quelle): Record<string, LoeschAktion> {
  const r: Record<string, LoeschAktion> = {};
  for (const k of v.baum.knoten) {
    const z = kennzeichen(v, k);
    r[k.id] = z === 'loeschen' ? 'loeschen' : z === 'geteilt' || z === 'bezug' ? (k.rechte.U ? 'entkoppeln' : 'behalten') : 'behalten';
  }
  return r;
}

/** Auswahl aus einer Eingabe: nur bekannte Aktionen, nur Ids als Schlüssel. */
export function liesLoeschAuswahl(e: unknown): Record<string, LoeschAktion> {
  const r: Record<string, LoeschAktion> = {};
  if (!e || typeof e !== 'object' || Array.isArray(e)) return r;
  for (const [id, a] of Object.entries(e as Record<string, unknown>)) if (typeof a === 'string' && a in LOESCH_AKTIONEN) r[id] = a as LoeschAktion;
  return r;
}

export type BleibtWeil = 'frist' | 'recht' | 'abgewaehlt' | 'verweis' | 'aussen' | 'entkoppelt';
export interface LoeschPlan {
  /** Ids in der Reihenfolge des Baums. */
  loeschen: string[];
  /** Verweise, die gekappt werden (Quelle bleibt, Ziel wird gelöscht). */
  entkoppeln: LoeschKante[];
  /** Was bleibt, mit Grund. */
  bleibt: Record<string, { weil: BleibtWeil; text: string }>;
  zahlen: { mappen: number; dokumente: number; frist: number; ohneRecht: number; verweise: number; gehalten: number; abgewaehlt: number };
}

/**
 * Plan aus Vorschau und Auswahl. Fehlt eine Mappe in der Auswahl, bleibt sie (neu Hinzugekommenes wird
 * nie ungefragt gelöscht). 📎 Bezug-Mappen werden nie gelöscht – auch „loeschen“ entfernt nur den Verweis. Danach so lange, bis sich nichts mehr ändert: Eine Mappe bleibt, wenn eine
 * Mappe außerhalb des Baums oder eine bleibende Mappe im Baum (ohne „nur Verweis entfernen“) auf sie verweist.
 */
export function planeLoeschung(v: Quelle, auswahl: Record<string, LoeschAktion>): LoeschPlan {
  const knoten = new Map(v.baum.knoten.map((k) => [k.id, k] as const));
  const titel = (id: string) => `„${knoten.get(id)?.titel || 'Ohne Titel'}“`;
  const L = new Set<string>();
  const E = new Set<string>();
  const bleibt: LoeschPlan['bleibt'] = {};
  const zahlen: LoeschPlan['zahlen'] = { mappen: 0, dokumente: 0, frist: 0, ohneRecht: 0, verweise: 0, gehalten: 0, abgewaehlt: 0 };
  for (const k of v.baum.knoten) {
    const gewuenscht = auswahl[k.id] ?? 'behalten';
    const wunsch = k.nurBezug && gewuenscht === 'loeschen' ? 'entkoppeln' : gewuenscht;
    if (k.gesperrt) { bleibt[k.id] = { weil: 'frist', text: k.nurBezug ? `Aufbewahrungsfrist bis ${datumText(k.aufbewahrenBis!)} – auch der Verweis bleibt` : `darf erst nach dem ${datumText(k.aufbewahrenBis!)} gelöscht werden` }; zahlen.frist++; continue; }
    if (wunsch === 'entkoppeln') {
      if (k.rechte.U) E.add(k.id);
      else { bleibt[k.id] = { weil: 'recht', text: 'kein Recht zum Bearbeiten – der Verweis bleibt' }; zahlen.ohneRecht++; }
      continue;
    }
    if (!k.rechte.D || v.nichtLoeschbar[k.id]) { bleibt[k.id] = { weil: 'recht', text: v.nichtLoeschbar[k.id] ?? 'kein Recht zum Löschen' }; zahlen.ohneRecht++; continue; }
    if (wunsch === 'loeschen') L.add(k.id);
    else { bleibt[k.id] = { weil: 'abgewaehlt', text: 'abgewählt' }; zahlen.abgewaehlt++; }
  }
  const nach = new Map<string, LoeschKante[]>();
  for (const e of v.kanten) if (e.quelleId !== e.zielId && knoten.has(e.quelleId) && knoten.has(e.zielId)) nach.set(e.zielId, [...(nach.get(e.zielId) ?? []), e]);
  for (let geaendert = true; geaendert;) {
    geaendert = false;
    for (const id of [...L]) {
      const k = knoten.get(id)!;
      let grund: { weil: BleibtWeil; text: string } | null = null;
      if (k.aussen.anzahl.verwiesenVon > 0) grund = { weil: 'aussen', text: k.aussen.anzahl.verwiesenVon === 1 ? 'eine Mappe außerhalb verweist darauf' : `${k.aussen.anzahl.verwiesenVon} Mappen außerhalb verweisen darauf` };
      else {
        const halter = (nach.get(id) ?? []).find((e) => !L.has(e.quelleId) && !E.has(e.quelleId));
        if (halter) grund = { weil: 'verweis', text: `${titel(halter.quelleId)} verweist darauf und bleibt` };
      }
      if (grund) { L.delete(id); bleibt[id] = grund; zahlen.gehalten++; geaendert = true; }
    }
  }
  const entkoppeln = v.kanten.filter((e) => E.has(e.quelleId) && L.has(e.zielId) && e.quelleId !== e.zielId);
  for (const id of E) {
    const n = entkoppeln.filter((e) => e.quelleId === id).length;
    const k = knoten.get(id)!;
    const feld = k.nurBezug && k.ueber ? ` „${k.ueber.feld}“` : '';
    bleibt[id] = n ? { weil: 'entkoppelt', text: n === 1 ? `nur der Verweis${feld} wird entfernt` : `nur die ${n} Verweise werden entfernt` } : { weil: 'entkoppelt', text: 'bleibt, Verweis bleibt auch' };
  }
  const loeschen = v.baum.knoten.filter((k) => L.has(k.id)).map((k) => k.id);
  zahlen.mappen = loeschen.length;
  zahlen.dokumente = loeschen.reduce((s, id) => s + (knoten.get(id)?.dokumente ?? 0), 0);
  zahlen.verweise = entkoppeln.length;
  return { loeschen, entkoppeln, bleibt, zahlen };
}

const anzahl = (n: number, eins: string, viele: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? eins : viele}`;

/** „37 Mappen und 112 Dokumente werden in den Papierkorb gelegt; 3 bleiben wegen Aufbewahrungsfrist; 2 Verweise werden entfernt.“ */
export function loeschZusammenfassung(p: LoeschPlan, papierkorb: boolean, erledigt = false): string {
  const z = p.zahlen;
  if (!z.mappen) return erledigt ? 'Es wurde nichts gelöscht.' : 'Es wird nichts gelöscht.';
  const eins = z.mappen + z.dokumente === 1;
  const wird = erledigt ? (eins ? 'wurde' : 'wurden') : (eins ? 'wird' : 'werden');
  const teile = [`${anzahl(z.mappen, 'Mappe', 'Mappen')}${z.dokumente ? ` und ${anzahl(z.dokumente, 'Dokument', 'Dokumente')}` : ''} ${wird} ${papierkorb ? 'in den Papierkorb gelegt' : 'endgültig gelöscht'}`];
  if (z.frist) teile.push(`${z.frist} ${z.frist === 1 ? 'bleibt' : 'bleiben'} wegen Aufbewahrungsfrist`);
  if (z.ohneRecht) teile.push(`${z.ohneRecht} ${z.ohneRecht === 1 ? 'bleibt' : 'bleiben'} mangels Recht`);
  if (z.gehalten) teile.push(`${z.gehalten} ${z.gehalten === 1 ? 'bleibt' : 'bleiben'}, weil noch darauf verwiesen wird`);
  if (z.abgewaehlt) teile.push(`${z.abgewaehlt} abgewählt`);
  if (z.verweise) teile.push(`${anzahl(z.verweise, erledigt ? 'Verweis wurde' : 'Verweis wird', erledigt ? 'Verweise wurden' : 'Verweise werden')} entfernt`);
  return `${teile.join('; ')}.`;
}
