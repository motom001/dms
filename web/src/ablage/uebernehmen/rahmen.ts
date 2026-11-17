import { formatiere, type Dokument, type Feld as FeldDef, type Mappentyp } from '../../../../shared/src/model';
import type { Abgleich } from '../../../../shared/src/erkennung';
import { seiteVorbereiten, type Bereich } from '../../../../shared/src/schwaerzen';
import { textformen, stelleVon } from '../../../../shared/src/uebernehmen';
import type { Bezuege } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import type { Marke } from '../bruecke';
import { BELEGE_MAX, type Woerter } from './hilfen';

/* ---------- Rahmen: Stellen der Vorschläge im Dokument (#939, in Häppchen seit #1255) ---------- */

export interface MarkenQuelle {
  zielTyp: Mappentyp | undefined;
  vorschlagStart: TypVorschlaege | undefined;
  abgleich: (Abgleich & { bezuege: Bezuege }) | null;
  woerter: Record<string, Woerter | 'keine'>;
  doks: Dokument[];
}
type Stelle = { dokId: string; bereiche: Bereich[] } | null;

/**
 * Die Arbeit für die Rahmen als kleine Schritte: erst je Seite den Seitentext bauen, dann je Feld die Stelle suchen.
 * Jeder Schritt hängt seine Marken an `liste` an – in der Reihenfolge der Felder nummeriert.
 */
export function markenSchritte(q: MarkenQuelle, liste: Marke[]): Array<() => void> {
  const { zielTyp, vorschlagStart: vs } = q;
  if (!zielTyp || !vs) return [];
  const mitText = q.doks.flatMap((x) => {
    const w = q.woerter[x.id];
    return w && w !== 'keine' && w.mitText ? [{ id: x.id, seiten: w.seiten }] : [];
  });
  const stelle = (formen: string[], fundstelle: string): Stelle => {
    for (const x of mitText) {
      const b = stelleVon(x.seiten, formen, fundstelle);
      if (b?.length) return { dokId: x.id, bereiche: b };
    }
    return null;
  };
  const vorbereiten = mitText.flatMap((x) => x.seiten.map((s) => () => seiteVorbereiten(s.woerter)));
  const felder = zielTyp.felder.map((f) => () => {
    const v = vs.vorschlaege[f.key];
    if (f.typ === 'referenz') {
      verweisMarken(f, v, { vs, abgleich: q.abgleich, stelle, liste });
      return;
    }
    if (!v) return;
    // Stelle vom Server (#939: Fundstelle in der Textebene gesucht), sonst hier gesucht.
    const s =
      v.stelle && q.doks.some((x) => x.id === v.stelle!.dokument)
        ? { dokId: v.stelle.dokument, bereiche: v.stelle.bereiche }
        : stelle(textformen(f, v.wert), v.fundstelle);
    if (s)
      liste.push({
        nr: liste.length + 1,
        feldKey: f.key,
        ...s,
        sicherheit: v.sicherheit,
        nutzlast: { text: formatiere(f, v.wert), wert: v.wert, feldTyp: f.typ },
      });
  });
  return [...vorbereiten, ...felder];
}

interface VerweisKontext {
  vs: TypVorschlaege;
  abgleich: MarkenQuelle['abgleich'];
  stelle(formen: string[], fundstelle: string): Stelle;
  liste: Marke[];
}
type Vorschlag = TypVorschlaege['vorschlaege'][string];

/** Verweis: die Belege des besten Treffers aus dem Abgleich, sonst der Titel der vorgeschlagenen Mappe. */
function verweisMarken(f: FeldDef, v: Vorschlag | undefined, { vs, abgleich, stelle, liste }: VerweisKontext) {
  const kandidat = abgleich?.verweise[f.key]?.[0];
  if (!kandidat) {
    if (v) titelMarke(f, v, { vs, abgleich, stelle, liste });
    return;
  }
  const titel = abgleich?.bezuege[kandidat.mappeId]?.titel ?? '';
  for (const [i, b] of kandidat.belege.slice(0, BELEGE_MAX).entries()) {
    const s = stelle([b.wert], b.fundstelle);
    if (s)
      liste.push({
        nr: liste.length + 1,
        feldKey: f.key,
        ...s,
        beleg: i,
        sicherheit: kandidat.sicherheit,
        nutzlast: { text: titel, mappeId: kandidat.mappeId, typId: kandidat.typId, titel, feldTyp: 'referenz', wert: kandidat.mappeId },
      });
  }
}

/** Vorschlag der Erkennung ohne Beleg aus dem Abgleich: der Titel der Mappe, wenn er im Dokument steht. */
function titelMarke(f: FeldDef, v: Vorschlag, { vs, stelle, liste }: VerweisKontext) {
  const id = Array.isArray(v.wert) ? String(v.wert[0] ?? '') : typeof v.wert === 'string' ? v.wert : '';
  const b = id ? vs.bezuege[id] : undefined;
  const s = b?.titel ? stelle([b.titel], '') : null;
  if (s && b)
    liste.push({
      nr: liste.length + 1,
      feldKey: f.key,
      ...s,
      sicherheit: v.sicherheit,
      nutzlast: { text: b.titel, mappeId: id, typId: b.typId, titel: b.titel, feldTyp: 'referenz', wert: id },
    });
}
