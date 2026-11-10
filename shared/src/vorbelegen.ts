/**
 * „Beim Auswählen übernehmen“ (#1037): Ein Verweisfeld schlägt Werte aus der gewählten Mappe vor – Paare „Feld der
 * verwiesenen Mappe → Feld dieser Mappe“, z. B. Vertragsart.Kündigungsfrist → Vertrag.Kündigungsfrist. Gespeichert am
 * Verweisfeld als `vorbelegen: [{ von, nach }]` (Schreibweise wie im Paketformat).
 *
 * Es sind **Vorschläge**: nur in leere Felder, sichtbar markiert, jederzeit änderbar; nichts wird still überschrieben.
 * Die Werte holt der Server mit den Rechten der Person (`/api/mappen/vorbelegen`, Erkennung, „Dokument übernehmen“).
 *
 * Mehrere Zieltypen (#1036): Ein Paar gilt für jede gewählte Mappe, deren Typ das Feld `von` hat (gleiche Kennung,
 * passende Feldart); Typen ohne das Feld übergehen es. So bleibt ein Verweis mit optionalen Zielen gültig, wenn später
 * ein Typ ohne das Feld dazukommt.
 *
 * Reine Funktionen für Server, Oberfläche und Tests; ohne Laufzeit-Abhängigkeit auf model.ts (das diese Datei nutzt).
 */
import type { Feld } from './model';
import { jedeMappe, zieleVon, zielErlaubt } from './verweisziele';
import { t } from './texte';
import { SCHLUESSEL } from './kennungen';

/** Ein Paar: `von` ist ein Feld der Mappe, auf die das Verweisfeld zeigt, `nach` ein Feld dieser Mappe. */
export interface Vorbelegung { von: string; nach: string }

/**
 * Ab dieser Version kennt Ablago `vorbelegen` (#1037) – ältere übergehen die Angabe (das Feld bleibt ein Verweis ohne
 * Vorschläge). Beim Einreihen auf die Version setzen, mit der es erscheint.
 */
export const DMS_VORBELEGEN_AB = '0.234.0';

/** Höchstzahl der Paare an einem Verweisfeld. */
export const VORBELEGEN_MAX = 50;

/** Eingabe (Editor, Paket, Schnittstelle) bereinigen: gültige Kennungen, je Zielfeld ein Paar, höchstens {@link VORBELEGEN_MAX}. */
export function bereinigeVorbelegen(e: unknown): Vorbelegung[] {
  if (!Array.isArray(e)) return [];
  const aus: Vorbelegung[] = [];
  for (const x of e) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const von = typeof r.von === 'string' ? r.von.trim() : '';
    const nach = typeof r.nach === 'string' ? r.nach.trim() : '';
    if (!SCHLUESSEL.test(von) || !SCHLUESSEL.test(nach) || aus.some((p) => p.nach === nach)) continue;
    aus.push({ von, nach });
    if (aus.length >= VORBELEGEN_MAX) break;
  }
  return aus;
}

/** Feldarten ohne übernehmbaren Wert: Passwörter nie (Sicherheit), Tabellen haben keinen eigenen Wert (#1030). */
const OHNE = new Set<Feld['typ']>(['passwort', 'tabelle']);

/**
 * Passt der Wert von `von` in `nach`? Gleiche Feldart (Text auch in Langtext); Mehrfachwerte nur in Mehrfachfelder;
 * Auswahl nur, wenn jede Option von `von` auch in `nach` steht; Verweise nur, wenn `nach` auf jeden Zieltyp von `von`
 * zeigen darf. Passwörter und Tabellen nie.
 */
export function passtZusammen(von: Feld, nach: Feld): boolean {
  if (OHNE.has(von.typ) || OHNE.has(nach.typ)) return false;
  if (von.typ !== nach.typ && !(von.typ === 'text' && nach.typ === 'langtext')) return false;
  if ((von.typ === 'auswahl' || von.typ === 'referenz') && von.mehrfach && !nach.mehrfach) return false;
  if (von.typ === 'auswahl') return (von.optionen ?? []).every((o) => (nach.optionen ?? []).includes(o));
  if (von.typ === 'referenz') {
    if (jedeMappe(von)) return jedeMappe(nach);
    const z = zieleVon(von);
    return z.length > 0 && z.every((id) => zielErlaubt(nach, id));
  }
  return true;
}

/** Felder dieser Mappe, in die etwas übernommen werden kann: Wertfelder, nicht das Verweisfeld selbst, keine Passwörter, nicht berechnet. */
export function moeglicheNach(felder: Feld[], f: Pick<Feld, 'key'>): Feld[] {
  return felder.filter((x) => x.key !== f.key && !OHNE.has(x.typ) && !x.berechnetVon && !x.system);
}

/**
 * Felder der Zieltypen, die als Quelle für `nach` taugen – je Kennung einmal, aus dem ersten Typ, der sie hat; nur,
 * wenn sie in jedem Zieltyp, der die Kennung hat, passen. Passwortfelder sind nie wählbar (Sicherheit).
 */
export function moeglicheVon(zielFelder: Feld[][], nach: Feld): Feld[] {
  const gesehen = new Map<string, Feld>();
  for (const l of zielFelder) for (const x of l) if (!gesehen.has(x.key)) gesehen.set(x.key, x);
  return [...gesehen.values()].filter((x) => zielFelder.every((l) => { const g = l.find((y) => y.key === x.key); return !g || passtZusammen(g, nach); }));
}

/**
 * Prüfung im Mappentyp: nur an Verweisfeldern mit festen Zieltypen; jedes Zielfeld gibt es in diesem Typ, es ist nicht
 * das Verweisfeld selbst und kein Passwort; das Quellfeld gibt es in mindestens einem bekannten Zieltyp, es ist kein
 * Passwort und passt überall, wo es vorkommt. `felderVon` kennt einen Typ nicht (etwa beim Einspielen eines Pakets) –
 * dann bleibt die Prüfung der eigenen Seite.
 */
export function vorbelegenProbleme(felder: Feld[], f: Feld, felderVon: (typId: string) => Feld[] | undefined): string[] {
  const paare = f.vorbelegen ?? [];
  if (!paare.length) return [];
  if (f.typ !== 'referenz' || jedeMappe(f)) return [t('gemeinsam.vorbelegen.nur-verweis')];
  const m: string[] = [];
  const listen = zieleVon(f).map(felderVon).filter((x): x is Feld[] => !!x);
  for (const p of paare) {
    const nach = felder.find((x) => x.key === p.nach);
    if (!nach) { m.push(t('gemeinsam.vorbelegen.nach-fehlt', { feld: p.nach })); continue; }
    const name = nach.label || nach.key;
    if (nach.key === f.key) { m.push(t('gemeinsam.vorbelegen.nicht-sich-selbst')); continue; }
    if (nach.typ === 'passwort') { m.push(t('gemeinsam.vorbelegen.passwort', { feld: name })); continue; }
    if (nach.typ === 'tabelle') { m.push(t('gemeinsam.vorbelegen.tabelle', { feld: name })); continue; }
    if (paare.filter((x) => x.nach === p.nach).length > 1) { m.push(t('gemeinsam.vorbelegen.doppelt', { feld: name })); continue; }
    if (!listen.length) continue;
    const von = listen.map((l) => l.find((x) => x.key === p.von)).filter((x): x is Feld => !!x);
    if (!von.length) { m.push(t('gemeinsam.vorbelegen.von-fehlt', { feld: p.von })); continue; }
    if (von.some((x) => x.typ === 'passwort')) { m.push(t('gemeinsam.vorbelegen.passwort', { feld: von[0].label || p.von })); continue; }
    if (von.some((x) => !passtZusammen(x, nach))) m.push(t('gemeinsam.vorbelegen.passt-nicht', { von: von[0].label || p.von, nach: name }));
  }
  return [...new Set(m)];
}

