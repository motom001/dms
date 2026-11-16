/** Gemeinsamer Kontext der Teile des Repos im Arbeitsspeicher (#1278): der Zustand und Hilfen, die ihn lesen. */
import type { MappenAblauf } from '../../../../shared/src/ablaufvorlagen';
import { istZeitraum, zeitraumTage } from '../../../../shared/src/feldarten';
import type { Aufgabe, FallOhneLeserecht, Mappe } from '../../../../shared/src/model';
import { datumIn, ziehe } from '../../../../shared/src/nummernkreis';
import type { Zaehlquelle } from '../../../../shared/src/sichten';
import { falte } from '../../../../shared/src/suche';
import type { SortierungIntern } from '..';
import { kopie } from './hilfen';
import { ablageZustand, arbeitZustand, paketZustand, type SpeicherZustand } from './zustand';

/** Hilfen über den Zustand: Fassungen, Nummern, Favoriten, Aufgaben mit Mappe, Wörter, Anlagen, Zählquelle. */
function zustandsHilfen(z: SpeicherZustand) {
  const { fassungen, kreise, favoriten, aufgaben, mappen, texte, dokumente, verweise } = z;
  const fassungenVon = (art: string, eintrag: string) => fassungen.get(`${art}|${eintrag}`) ?? [];
  /** Nummer ziehen (#171); synchron, damit gleichzeitiges Anlegen keine doppelten Nummern ergibt. */
  const zieheSync = (schluessel: string, mappeId: string | null, j: Date) => {
    const k = kreise.get(schluessel);
    if (!k) throw new Error(`Nummernkreis ${schluessel} fehlt`);
    const r = ziehe(k, datumIn(j), mappeId, j.toISOString());
    kreise.set(schluessel, r.kreis);
    return r.nummer;
  };
  const istFavorit = (mappeId: string, benutzerId: string) => !!favoriten.get(benutzerId)?.has(mappeId);
  const offenFuer = (m: Mappe, benutzerId: string, admin: boolean) =>
    [...aufgaben.values()].some((a) => a.mappeId === m.id && !a.erledigt && (a.empfaengerId === benutzerId || (admin && !a.empfaengerId)));
  const mitMappe = (a: Aufgabe): Aufgabe => ({
    ...kopie(a),
    mappeTitel: mappen.get(a.mappeId)?.titel ?? '',
    typId: mappen.get(a.mappeId)?.typId,
  });
  const mitMappeF = (f: FallOhneLeserecht): FallOhneLeserecht => {
    const m = mappen.get(f.mappeId);
    return m ? { ...kopie(f), mappeTitel: m.titel ?? '', typId: m.typId } : kopie(f);
  };
  const mitMappeE = (e: MappenAblauf): MappenAblauf => ({
    ...kopie(e),
    mappeTitel: mappen.get(e.mappeId)?.titel ?? '',
    typId: mappen.get(e.mappeId)?.typId,
  });
  /** Wörter aus Titeln, Werten, Notizen und Volltexten mit ihrer Häufigkeit (wie dms_woerter in PostgreSQL). */
  const alleWoerter = () => {
    const n = new Map<string, number>();
    const dazu = (t: string) => {
      for (const w of falte(t).split(/[^0-9a-zа-яёіїєґ]+/))
        if (w.length >= 4 && w.length <= 40 && !/^\d+$/.test(w)) n.set(w, (n.get(w) ?? 0) + 1);
    };
    for (const m of mappen.values()) {
      dazu(m.titel ?? '');
      for (const v of Object.values(m.werte))
        if (!(typeof v === 'string' && v.startsWith('dms1$'))) dazu(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    for (const t of texte.values()) if (t) dazu(t);
    return n;
  };
  /** Wie ON DELETE SET NULL in PostgreSQL (#998): Anlagen eines gelöschten Hauptdokuments sind danach eigene Dokumente. */
  const ohneHauptdokument = (id: string) => {
    for (const d of dokumente.values())
      if (d.anlageZu === id) {
        delete d.anlageZu;
        delete d.anlageNr;
      }
  };
  /** Zählt wie PostgreSQL: Dokumente je Register, Rückverweise (ohne sich selbst) je Quelle. */
  const zaehl: Zaehlquelle = {
    dokumente: (id, register) =>
      [...dokumente.values()].filter((d) => d.mappeId === id && (register === null || d.registerKey === register)).length,
    favorit: (id, benutzer) => istFavorit(id, benutzer),
    aufgabe: (id, benutzer) => [...aufgaben.values()].some((a) => a.mappeId === id && !a.erledigt && a.empfaengerId === benutzer),
    typVon: (id) => mappen.get(id)?.typId,
    verknuepfungen: (id, quellen) =>
      new Set(
        [...verweise.entries()]
          .filter(
            ([q, vs]) =>
              q !== id &&
              vs.some(
                (v) =>
                  v.zielId === id && (!quellen.length || quellen.some((x) => x.typId === mappen.get(q)?.typId && x.feldKey === v.feldKey)),
              ),
          )
          .map(([q]) => q),
      ).size,
  };

  return { fassungenVon, zieheSync, istFavorit, offenFuer, mitMappe, mitMappeF, mitMappeE, alleWoerter, ohneHauptdokument, zaehl };
}

/** Sortierung wie in PostgreSQL (#740). */
function sortierHilfen(z: SpeicherZustand) {
  const { typen } = z;
  /** Wie die Sortierung in PostgreSQL: leere Werte immer zuletzt. */
  const wertFuer = (m: Mappe, so: SortierungIntern): string | number | boolean | null => {
    const v = so.key ? m.werte[so.key] : undefined;
    switch (so.art) {
      case 'titel':
        return (m.titel ?? '').toLowerCase();
      case 'erstellt':
        return m.erstellt;
      case 'geaendert':
        return m.geaendert;
      case 'erstelltVon':
        return m.erstelltVon;
      case 'geaendertVon':
        return m.geaendertVon;
      case 'typ':
        return typen.get(m.typId)?.name.toLowerCase() ?? null;
      case 'betrag':
        return v && typeof v === 'object' && 'betrag' in v ? (v as { betrag: number }).betrag : null;
      case 'zeitraum':
        return istZeitraum(v) ? zeitraumTage(v) : null;
      case 'zahl':
      case 'janein':
        return v == null || v === '' ? null : (v as number | boolean);
      default:
        return v == null || v === '' ? null : String(v).toLowerCase();
    }
  };
  const vergleiche = (a: Mappe, b: Mappe, so?: SortierungIntern) => {
    if (!so) return 0;
    const x = wertFuer(a, so),
      y = wertFuer(b, so);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const r = x < y ? -1 : 1;
    return so.absteigend ? -r : r;
  };

  return { wertFuer, vergleiche };
}

/** Ein neuer, leerer Zustand samt Hilfen – je Repo einer. */
export function speicherKontext() {
  const z: SpeicherZustand = { ...ablageZustand(), ...arbeitZustand(), ...paketZustand() };
  return Object.assign(z, zustandsHilfen(z), sortierHilfen(z));
}

export type SpeicherKontext = ReturnType<typeof speicherKontext>;
