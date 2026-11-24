/**
 * Was Ablago darf (#1562, intern: Vertrauensstufen): zwei Grenzen für die ganze Installation.
 *
 * - Frage 1 „Welche Pakete darf Ablago nutzen?“ (`pakete`): keine · nur Vorlagen · auch Helfer, die nur hier arbeiten
 *   (Vorgabe) · auch Helfer, die Dienste im Netz nutzen (#1633). Der Server hält sich daran: Ein Paket über der Grenze lässt sich weder
 *   installieren noch aktualisieren.
 * - Frage 2 „Wie viel soll Ablago von sich aus tun?“ (`selbst`): nichts · erkennen und vorlegen (Vorgabe) · alles
 *   erledigen. Hier nur gespeichert; die Wirkung kommt mit #1567 und #1568.
 *
 * Die Stufe eines Pakets leitet Ablago aus dem Manifest ab: ohne Code nur Vorlagen, mit Code und ohne Netz „nur hier“,
 * mit Netz (feste Adressen oder Dienst-Adressen) „Dienste im Netz“. Eingebaute Helfer von Ablago (Texterkennung, PDF/A,
 * Volltext, Umwandeln aus dem offiziellen Katalog, ohne Netz) laufen auf jeder Antwort; ein fremdes Paket, das einen
 * davon ersetzt, folgt Frage 1 (Stufe und eingebaute Helfer: shared/src/pakete/stufe.ts). In der Oberfläche stehen nie Stufennummern, nur Antworten und Gründe in Worten.
 */

export const PAKETE_GRENZEN = ['keine', 'vorlagen', 'lokal', 'netz'] as const;
export type PaketeGrenze = (typeof PAKETE_GRENZEN)[number];
export const SELBST_STUFEN = ['nichts', 'vorschlag', 'alles'] as const;
export type SelbstStufe = (typeof SELBST_STUFEN)[number];

/** Stufe eines Pakets: was es mindestens braucht. */
export type PaketStufe = Exclude<PaketeGrenze, 'keine'>;

export interface Darf {
  pakete: PaketeGrenze;
  selbst: SelbstStufe;
}

/** Vorgabe für neue Installationen (Empfohlen in beiden Fragen). */
export const DARF_VORGABE: Darf = { pakete: 'lokal', selbst: 'vorschlag' };
/** Name der Einstellung (eine für die ganze Installation). */
export const DARF_EINSTELLUNG = 'darf';

/** Stand für Oberfläche und Server: die Werte, Höchstwerte vom Anbieter und ob die Werte beim Update gesetzt wurden. */
export interface DarfStand extends Darf {
  /** Höchstwerte vom Anbieter (Einrichtungsdatei, #1562); fehlt = keine Grenze. */
  hoechstens: Partial<Darf>;
  /** neu = bei der Einrichtung gesetzt; update = beim Update einer bestehenden Installation abgeleitet. */
  herkunft: 'neu' | 'update';
}

export const istPaketeGrenze = (v: unknown): v is PaketeGrenze => (PAKETE_GRENZEN as readonly unknown[]).includes(v);
export const istSelbstStufe = (v: unknown): v is SelbstStufe => (SELBST_STUFEN as readonly unknown[]).includes(v);
const nr = (liste: readonly string[], v: string) => liste.indexOf(v);
const grenzeNr = (g: PaketeGrenze) => nr(PAKETE_GRENZEN, g);
const selbstNr = (s: SelbstStufe) => nr(SELBST_STUFEN, s);

/** Ist `neu` lockerer als `alt` (in mindestens einer Frage)? Dann braucht die Änderung eine frische Anmeldung. */
export const hoeher = (alt: Darf, neu: Darf) => grenzeNr(neu.pakete) > grenzeNr(alt.pakete) || selbstNr(neu.selbst) > selbstNr(alt.selbst);
/** Ist `neu` strenger als `alt` in Frage 1? Dann zeigt Ablago vorher, was angehalten wird. */
export const strenger = (alt: Darf, neu: Darf) => grenzeNr(neu.pakete) < grenzeNr(alt.pakete);

/** Liegt eine Antwort über dem Höchstwert des Anbieters? */
export const ueberHoechstwert = (h: Partial<Darf>, d: Partial<Darf>) =>
  (!!h.pakete && !!d.pakete && grenzeNr(d.pakete) > grenzeNr(h.pakete)) ||
  (!!h.selbst && !!d.selbst && selbstNr(d.selbst) > selbstNr(h.selbst));

/** Darf ein Paket dieser Stufe unter der Grenze laufen? */
export const erlaubt = (grenze: PaketeGrenze, stufe: PaketStufe) => grenzeNr(grenze) >= grenzeNr(stufe);

/** Gespeicherte Werte lesen; Unbekanntes fällt weg. null = noch nichts gespeichert. */
export function liesDarf(v: unknown): DarfStand | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!istPaketeGrenze(o.pakete) || !istSelbstStufe(o.selbst)) return null;
  const h = (o.hoechstens && typeof o.hoechstens === 'object' ? o.hoechstens : {}) as Record<string, unknown>;
  return {
    pakete: o.pakete,
    selbst: o.selbst,
    hoechstens: {
      ...(istPaketeGrenze(h.pakete) ? { pakete: h.pakete } : {}),
      ...(istSelbstStufe(h.selbst) ? { selbst: h.selbst } : {}),
    },
    herkunft: o.herkunft === 'update' ? 'update' : 'neu',
  };
}
