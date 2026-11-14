/**
 * Suche im Handbuch (#1219): Der Assistent unten rechts sucht im mitgelieferten Handbuch – ohne Netz nach draußen (F2).
 * Grundlage ist das Suchverzeichnis, das mkdocs (Plugin `search`) neben jedes gebaute Handbuch legt
 * (`/hilfe/<handbuch>/[<sprache>/]search/search_index.json`, #219). Hier steht nur die Logik ohne Oberfläche:
 * Verzeichnis lesen, Text ohne HTML, suchen und ordnen. Gesucht wird wie in den Listen (`durchsuche`): ohne Groß- und
 * Kleinschreibung, Akzente und mit Umlaut-Varianten; mehrere Wörter müssen alle vorkommen.
 */
import { durchsuche, type Textteil } from './listensuche';

/** Ein Abschnitt des Handbuchs, wie ihn die Suche braucht. */
export interface HandbuchAbschnitt {
  /** Adresse im Handbuch, relativ zu seiner Wurzel, z. B. „post/#dokument-ubernehmen“ („“ = Startseite). */
  adresse: string;
  titel: string;
  /** Titel der Seite, zu der der Abschnitt gehört (bei einer Seite ihr eigener Titel). */
  seite: string;
  /** Ist der Eintrag eine ganze Seite (kein Abschnitt)? */
  istSeite: boolean;
  /** Text ohne HTML. */
  text: string;
}

export interface HandbuchTreffer {
  abschnitt: HandbuchAbschnitt;
  /** Titel mit hervorgehobenem Suchwort – nur, wenn es im Titel steht. */
  titel?: Textteil[];
  /** Ausschnitt um die erste Fundstelle im Text; ohne Fund im Text die ersten Worte. */
  ausschnitt: Textteil[];
}

const ZEICHEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML aus dem Suchverzeichnis als schlichter Text: Tags weg, Entitäten aufgelöst, Leerraum zusammengefasst. */
export function ohneHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (ganz, name: string) => {
      if (name[0] === '#') {
        const n = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      }
      return ZEICHEN[name.toLowerCase()] ?? ganz;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Die ersten Worte eines Texts, höchstens `max` Zeichen, an einer Wortgrenze mit „…“. */
export function ersteWorte(text: string, max = 140): string {
  if (text.length <= max) return text;
  const schnitt = text.slice(0, max);
  const grenze = schnitt.lastIndexOf(' ');
  return `${(grenze > max / 2 ? schnitt.slice(0, grenze) : schnitt).trimEnd()} …`;
}

/**
 * Liest das Suchverzeichnis von mkdocs (`{ config, docs: [{ location, title, text }] }`). Unbekanntes und Kaputtes
 * fällt still weg; ohne `docs` gibt es ein leeres Verzeichnis.
 */
export function handbuchVerzeichnis(roh: unknown): HandbuchAbschnitt[] {
  const docs = roh && typeof roh === 'object' && Array.isArray((roh as { docs?: unknown }).docs) ? (roh as { docs: unknown[] }).docs : [];
  const eintraege = docs.flatMap((d) => {
    if (!d || typeof d !== 'object') return [];
    const { location, title, text } = d as Record<string, unknown>;
    if (typeof location !== 'string' || typeof title !== 'string' || !title.trim()) return [];
    return [{ adresse: location, titel: ohneHtml(title), text: typeof text === 'string' ? ohneHtml(text) : '' }];
  });
  // Seiten: Einträge ohne „#“. Ein Abschnitt gehört zur Seite vor dem „#“.
  const seiten = new Map(eintraege.filter((e) => !e.adresse.includes('#')).map((e) => [e.adresse, e.titel]));
  return eintraege.map((e) => {
    const istSeite = !e.adresse.includes('#');
    const pfad = e.adresse.split('#')[0];
    return { ...e, istSeite, seite: istSeite ? e.titel : seiten.get(pfad) ?? '' };
  });
}

/**
 * Sucht im Handbuch: Treffer im Titel zuerst, dann die übrigen – je Gruppe in der Reihenfolge des Handbuchs.
 * Höchstens `max` Treffer; ohne Suchwort keine.
 */
export function sucheImHandbuch(abschnitte: readonly HandbuchAbschnitt[], suche: string, max = 8): HandbuchTreffer[] {
  if (!suche.trim()) return [];
  const treffer = durchsuche(abschnitte, (a) => [{ wo: '', text: a.titel, titel: true }, { wo: a.seite, text: a.text }], suche, { umfeld: 48 });
  const geordnet = [...treffer.filter((x) => x.titel), ...treffer.filter((x) => !x.titel)];
  return geordnet.slice(0, max).map((x) => ({
    abschnitt: x.eintrag,
    ...(x.titel ? { titel: x.titel } : {}),
    ausschnitt: x.funde[0]?.teile ?? [{ text: ersteWorte(x.eintrag.text), treffer: false }],
  }));
}
